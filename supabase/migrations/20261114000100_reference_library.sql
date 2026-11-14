-- The reference library (docs/13, Batch 5): athletes, their reference shots (numbers only:
-- a shot signature) and any assets (pictures, pose tracks). Every shot and asset carries its
-- rights: where it came from, who granted what, until when. Nothing is readable without
-- rights that are granted, unexpired and permit the use; an asset also needs its shot's.
-- Only site admins add or change rows. Additive only: no existing table changes.

create table public.reference_athletes (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  -- generated: made by Aline, not a person; coach_model: a coach's own demonstration;
  -- licensed_athlete: a player who signed a licence.
  kind text not null check (kind in ('generated', 'coach_model', 'licensed_athlete')),
  handedness text check (handedness in ('right', 'left')),
  created_at timestamptz not null default now()
);

create table public.reference_shots (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.reference_athletes (id) on delete cascade,
  shot text not null check (shot in ('front_foot_defence', 'back_foot_defence')),
  axis text check (axis in ('forward', 'sideways')),
  media text not null check (media in ('video', 'photo')),
  signature jsonb not null check (jsonb_typeof(signature) = 'object' and octet_length(signature::text) < 8192),
  engine_version text not null,
  -- Provenance and rights.
  source text not null check (char_length(btrim(source)) between 3 and 300),
  rights_status text not null default 'pending' check (rights_status in ('pending', 'granted', 'revoked')),
  permitted_use text[] not null default '{}' check (permitted_use <@ array['compare', 'show_numbers', 'show_pictures', 'pdf']),
  licence_ref text,
  rights_expires_at timestamptz,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  -- Granted rights need a licence record (a generated reference names the generator).
  check (rights_status <> 'granted' or licence_ref is not null)
);
create index reference_shots_shot_idx on public.reference_shots (shot, axis);

create table public.reference_assets (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null references public.reference_shots (id) on delete cascade,
  kind text not null check (kind in ('picture', 'pose_track')),
  storage_path text not null,
  source text not null check (char_length(btrim(source)) between 3 and 300),
  rights_status text not null default 'pending' check (rights_status in ('pending', 'granted', 'revoked')),
  permitted_use text[] not null default '{}' check (permitted_use <@ array['show_pictures', 'pdf']),
  licence_ref text,
  rights_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (rights_status <> 'granted' or licence_ref is not null)
);
create index reference_assets_shot_idx on public.reference_assets (shot_id);

-- Whether a row's rights allow a use now.
create function public.reference_rights_ok(status text, uses text[], expires timestamptz, use_needed text) returns boolean
language sql stable set search_path = '' as $$
  select status = 'granted' and use_needed = any(uses) and (expires is null or expires > now())
$$;

alter table public.reference_athletes enable row level security;
alter table public.reference_shots enable row level security;
alter table public.reference_assets enable row level security;

-- Shots: public ones whose rights permit comparison (anyone). Admins read and write every
-- row through the policies below.
create policy reference_shots_read on public.reference_shots for select to anon, authenticated
  using (visibility = 'public' and public.reference_rights_ok(rights_status, permitted_use, rights_expires_at, 'compare'));
-- Athletes: only those with a readable shot (the shots' own policies apply inside).
create policy reference_athletes_read on public.reference_athletes for select to anon, authenticated
  using (exists (select 1 from public.reference_shots s where s.athlete_id = reference_athletes.id));
-- Assets: their own rights to show pictures, and a readable shot.
create policy reference_assets_read on public.reference_assets for select to anon, authenticated
  using (
    public.reference_rights_ok(rights_status, permitted_use, rights_expires_at, 'show_pictures')
    and exists (select 1 from public.reference_shots s where s.id = reference_assets.shot_id)
  );

-- Writes: site admins only.
create policy reference_athletes_admin on public.reference_athletes for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy reference_shots_admin on public.reference_shots for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy reference_assets_admin on public.reference_assets for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));

revoke all on public.reference_athletes, public.reference_shots, public.reference_assets from anon, authenticated;
grant select on public.reference_athletes, public.reference_shots, public.reference_assets to anon, authenticated;
grant insert, update, delete on public.reference_athletes, public.reference_shots, public.reference_assets to authenticated;
revoke all on function public.reference_rights_ok(text, text[], timestamptz, text) from public;
grant execute on function public.reference_rights_ok(text, text[], timestamptz, text) to anon, authenticated;
