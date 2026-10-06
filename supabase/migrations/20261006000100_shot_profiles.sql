-- Shot profiles: a defence's signature (numbers only: the line, its timing and the shape
-- around it; never video or images), so players can compare shots with each other. Private
-- by default; a player may share one under a display name they choose, and then any
-- signed-in player can compare against it. Other players never see who owns a profile.

create table public.shot_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The on-device analysis it came from (not necessarily saved to the cloud).
  analysis_id text,
  created_at timestamptz not null default now(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  handedness text check (handedness in ('right', 'left')),
  skill_level text check (skill_level in ('beginner', 'club', 'academy', 'elite')),
  axis text check (axis in ('forward', 'sideways')),
  media text not null check (media in ('video', 'photo')),
  signature jsonb not null check (jsonb_typeof(signature) = 'object' and octet_length(signature::text) < 8192),
  shared boolean not null default false,
  engine_version text not null
);

create index shot_profiles_shared_idx on public.shot_profiles (created_at desc) where shared;
create index shot_profiles_owner_idx on public.shot_profiles (owner_id);

alter table public.shot_profiles enable row level security;

create policy shot_profiles_select on public.shot_profiles
  for select to authenticated using (shared or owner_id = (select auth.uid()));
create policy shot_profiles_insert on public.shot_profiles
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy shot_profiles_update on public.shot_profiles
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy shot_profiles_delete on public.shot_profiles
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Every column but the owner is readable (policies above decide which rows).
revoke all on public.shot_profiles from anon, authenticated;
grant select (id, analysis_id, created_at, display_name, handedness, skill_level, axis, media, signature, shared, engine_version)
  on public.shot_profiles to authenticated;
grant insert (analysis_id, display_name, handedness, skill_level, axis, media, signature, shared, engine_version)
  on public.shot_profiles to authenticated;
grant update (display_name, shared) on public.shot_profiles to authenticated;
grant delete on public.shot_profiles to authenticated;
