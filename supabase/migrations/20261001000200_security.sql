-- Access rules, immutability, audit triggers and private storage buckets.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Latest consent for a user and kind.
create or replace function private.has_consent(uid uuid, consent_kind text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select c.granted from public.consents c
    where c.user_id = uid and c.kind = consent_kind
    order by c.created_at desc limit 1
  ), false);
$$;

-- Owner, or an active coach the owner has consented to share with.
create or replace function private.can_view(owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) = owner
    or (
      exists (
        select 1 from public.coach_links l
        where l.coach_id = (select auth.uid()) and l.player_id = owner and l.status = 'active'
      )
      and private.has_consent(owner, 'coach_sharing')
    );
$$;
grant usage on schema private to authenticated;
grant execute on function private.can_view(uuid) to authenticated;
grant execute on function private.has_consent(uuid, text) to authenticated;

-- Keep updated_at honest.
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger coach_links_touch before update on public.coach_links for each row execute function private.touch_updated_at();

-- Analysis payloads are immutable: reports must be reproducible from them.
create or replace function private.reject_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'analysis payloads are immutable; create a new analysis instead';
end;
$$;
create trigger analysis_payloads_immutable before update on public.analysis_payloads for each row execute function private.reject_update();

-- Measurement columns of an analysis are immutable; only notes, tags, title and
-- the representative flag may change.
create or replace function private.guard_analysis_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.status, new.status_reason, new.observed_label, new.observed_prob, new.technique_index,
      new.result_hash, new.input_hash, new.engine_version, new.metric_version, new.registry_hash, new.owner_id)
     is distinct from
     (old.status, old.status_reason, old.observed_label, old.observed_prob, old.technique_index,
      old.result_hash, old.input_hash, old.engine_version, old.metric_version, old.registry_hash, old.owner_id) then
    raise exception 'analysis results are immutable';
  end if;
  return new;
end;
$$;
create trigger analyses_guard before update on public.analyses for each row execute function private.guard_analysis_update();

-- Audit consent changes and coach link changes.
create or replace function private.audit_consent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, subject_owner, action, subject_type, subject_id, detail)
  values (new.user_id, new.user_id, case when new.granted then 'consent_granted' else 'consent_revoked' end,
          'consent', new.kind, jsonb_build_object('policy_version', new.policy_version));
  return new;
end;
$$;
create trigger consents_audit after insert on public.consents for each row execute function private.audit_consent();

create or replace function private.audit_coach_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, subject_owner, action, subject_type, subject_id, detail)
  values ((select auth.uid()), new.player_id,
          case when tg_op = 'INSERT' then 'coach_link_created' else 'coach_link_' || new.status end,
          'coach_link', new.coach_id::text, '{}'::jsonb);
  return new;
end;
$$;
create trigger coach_links_audit after insert or update on public.coach_links for each row execute function private.audit_coach_link();

-- Player redeems a coach's invite code (this is the player's share decision).
create or replace function public.redeem_coach_invite(invite_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  coach uuid;
begin
  select i.coach_id into coach from public.coach_invites i
  where i.code = invite_code and i.expires_at > now();
  if coach is null then
    raise exception 'invite code not found or expired';
  end if;
  if coach = (select auth.uid()) then
    raise exception 'you cannot link to yourself';
  end if;
  insert into public.coach_links (coach_id, player_id, status)
  values (coach, (select auth.uid()), 'active')
  on conflict (coach_id, player_id) do update set status = 'active';
  insert into public.consents (user_id, kind, granted, policy_version)
  values ((select auth.uid()), 'coach_sharing', true, 'privacy-2026-10');
  return coach;
end;
$$;
revoke execute on function public.redeem_coach_invite(text) from public, anon;
grant execute on function public.redeem_coach_invite(text) to authenticated;

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.coach_invites enable row level security;
alter table public.coach_links enable row level security;
alter table public.analyses enable row level security;
alter table public.analysis_payloads enable row level security;
alter table public.observations enable row level security;
alter table public.metric_values enable row level security;
alter table public.reports enable row level security;
alter table public.baselines enable row level security;
alter table public.annotations enable row level security;
alter table public.media_objects enable row level security;
alter table public.audit_log enable row level security;
alter table public.registry_versions enable row level security;

create policy "profiles: read own or linked" on public.profiles for select to authenticated
  using (private.can_view(id));
create policy "profiles: insert own" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "consents: read own" on public.consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "consents: append own" on public.consents for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "invites: coach manages own" on public.coach_invites for all to authenticated
  using ((select auth.uid()) = coach_id) with check ((select auth.uid()) = coach_id);

create policy "links: parties read" on public.coach_links for select to authenticated
  using ((select auth.uid()) in (coach_id, player_id));
create policy "links: parties revoke" on public.coach_links for update to authenticated
  using ((select auth.uid()) in (coach_id, player_id)) with check (status = 'revoked');

create policy "analyses: read" on public.analyses for select to authenticated using (private.can_view(owner_id));
create policy "analyses: insert own" on public.analyses for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "analyses: update own" on public.analyses for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "analyses: delete own" on public.analyses for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "payloads: read" on public.analysis_payloads for select to authenticated using (private.can_view(owner_id));
create policy "payloads: insert own" on public.analysis_payloads for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy "observations: read" on public.observations for select to authenticated using (private.can_view(owner_id));
create policy "observations: insert own" on public.observations for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy "metrics: read" on public.metric_values for select to authenticated using (private.can_view(owner_id));
create policy "metrics: insert own" on public.metric_values for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy "reports: read" on public.reports for select to authenticated using (private.can_view(owner_id));
create policy "reports: insert own" on public.reports for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy "baselines: read" on public.baselines for select to authenticated using (private.can_view(owner_id));
create policy "baselines: write own" on public.baselines for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "baselines: update own" on public.baselines for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "annotations: read" on public.annotations for select to authenticated
  using (exists (select 1 from public.analyses a where a.id = analysis_id and private.can_view(a.owner_id)));
create policy "annotations: write if visible" on public.annotations for insert to authenticated
  with check ((select auth.uid()) = author_id
    and exists (select 1 from public.analyses a where a.id = analysis_id and private.can_view(a.owner_id)));
create policy "annotations: delete own" on public.annotations for delete to authenticated using ((select auth.uid()) = author_id);

create policy "media: read" on public.media_objects for select to authenticated using (private.can_view(owner_id));
create policy "media: insert own" on public.media_objects for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "media: delete own" on public.media_objects for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "audit: read own" on public.audit_log for select to authenticated
  using ((select auth.uid()) in (actor_id, subject_owner));

create policy "registry: public read" on public.registry_versions for select to anon, authenticated using (true);
create policy "registry: publish" on public.registry_versions for insert to authenticated with check (true);

-- ---------- Storage: private buckets, size and type caps ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('tracks', 'tracks', false, 2097152, array['application/octet-stream']),
  ('evidence', 'evidence', false, 524288, array['image/webp', 'image/jpeg']),
  ('raw-video', 'raw-video', false, 26214400, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects live under "<owner uuid>/..." in every bucket.
create or replace function private.can_view_object(object_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  folder text := (storage.foldername(object_name))[1];
begin
  if folder is null or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.can_view(folder::uuid);
end;
$$;
grant execute on function private.can_view_object(text) to authenticated;

create policy "storage: owner writes" on storage.objects for insert to authenticated
  with check (bucket_id in ('tracks', 'evidence', 'raw-video') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id in ('tracks', 'evidence', 'raw-video') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: owner or coach reads" on storage.objects for select to authenticated
  using (bucket_id in ('tracks', 'evidence', 'raw-video') and private.can_view_object(name));
