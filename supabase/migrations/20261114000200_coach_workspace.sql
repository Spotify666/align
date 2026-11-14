-- The coach workspace (docs/13, Batch 6): squads, a coach's own assessment of a shot beside
-- Aline's result, and assignments (focus, drill, retest by, a reference). Additive only.
--
-- A coach sees and writes only for players linked to them who consented to share
-- (private.can_view, the same rule as every shared analysis). A coach never changes Aline's
-- result: the analyses and their payloads stay writable by their owner only, and the coach's
-- words live in their own rows. A player reads what their coaches wrote about them and may
-- only mark an assignment done. Every insert, change and removal lands in the audit log.

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create index squads_coach on public.squads (coach_id);

create table public.squad_members (
  squad_id uuid not null references public.squads (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (squad_id, player_id)
);
create index squad_members_player on public.squad_members (player_id);

-- The coach's view of one analysis. Aline's result is never edited: this sits beside it.
create table public.coach_assessments (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  coach_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Whether the coach agrees with Aline's answer about the shot.
  agrees text check (agrees in ('agree', 'disagree', 'unsure')),
  focus text check (focus in ('alignment', 'footwork', 'balance', 'bat_contact', 'hands', 'timing', 'outcome', 'reference')),
  notes text check (char_length(notes) <= 2000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id, coach_id)
);
create index coach_assessments_coach on public.coach_assessments (coach_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  analysis_id uuid references public.analyses (id) on delete set null,
  focus text check (focus in ('alignment', 'footwork', 'balance', 'bat_contact', 'hands', 'timing', 'outcome', 'reference')),
  drill text check (char_length(drill) <= 120),
  retest_by date,
  reference_shot_id uuid references public.reference_shots (id) on delete set null,
  note text check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coach_id <> player_id)
);
create index assignments_player on public.assignments (player_id, status);
create index assignments_coach on public.assignments (coach_id, status);

create trigger coach_assessments_touch before update on public.coach_assessments for each row execute function private.touch_updated_at();
create trigger assignments_touch before update on public.assignments for each row execute function private.touch_updated_at();

-- A player may only mark their own assignment done (or open again); everything else is the coach's.
create function private.guard_assignment_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) = old.player_id and (select auth.uid()) <> old.coach_id then
    if (new.coach_id, new.player_id, new.analysis_id, new.focus, new.drill, new.retest_by, new.reference_shot_id, new.note)
       is distinct from (old.coach_id, old.player_id, old.analysis_id, old.focus, old.drill, old.retest_by, old.reference_shot_id, old.note)
       or new.status not in ('open', 'done') then
      raise exception 'A player can only mark an assignment done' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger assignments_guard before update on public.assignments for each row execute function private.guard_assignment_update();

-- The audit trail: who did what to whose record.
create function private.audit_coach_work() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  owner uuid;
begin
  owner := case tg_table_name
    when 'squads' then (j ->> 'coach_id')::uuid
    when 'squad_members' then (j ->> 'player_id')::uuid
    when 'coach_assessments' then (select a.owner_id from public.analyses a where a.id = (j ->> 'analysis_id')::uuid)
    when 'assignments' then (j ->> 'player_id')::uuid
  end;
  insert into public.audit_log (actor_id, subject_owner, action, subject_type, subject_id, detail)
  values ((select auth.uid()), owner, lower(tg_op), tg_table_name,
          coalesce(j ->> 'id', j ->> 'squad_id'),
          case when tg_table_name = 'assignments' then jsonb_build_object('status', j ->> 'status')
               when tg_table_name = 'squad_members' then jsonb_build_object('player_id', j ->> 'player_id')
               else '{}'::jsonb end);
  return null;
end $$;
create trigger squads_audit after insert or update or delete on public.squads for each row execute function private.audit_coach_work();
create trigger squad_members_audit after insert or delete on public.squad_members for each row execute function private.audit_coach_work();
create trigger coach_assessments_audit after insert or update or delete on public.coach_assessments for each row execute function private.audit_coach_work();
create trigger assignments_audit after insert or update or delete on public.assignments for each row execute function private.audit_coach_work();

alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.coach_assessments enable row level security;
alter table public.assignments enable row level security;

create policy "squads: coach manages own" on public.squads for all to authenticated
  using ((select auth.uid()) = coach_id) with check ((select auth.uid()) = coach_id);

create policy "squad members: coach reads own squads, player reads own" on public.squad_members for select to authenticated
  using ((select auth.uid()) = player_id or exists (select 1 from public.squads s where s.id = squad_id and s.coach_id = (select auth.uid())));
create policy "squad members: coach adds linked players" on public.squad_members for insert to authenticated
  with check (exists (select 1 from public.squads s where s.id = squad_id and s.coach_id = (select auth.uid())) and private.can_view(player_id));
create policy "squad members: coach removes" on public.squad_members for delete to authenticated
  using (exists (select 1 from public.squads s where s.id = squad_id and s.coach_id = (select auth.uid())));

create policy "assessments: coach and player read" on public.coach_assessments for select to authenticated
  using ((select auth.uid()) = coach_id or exists (select 1 from public.analyses a where a.id = analysis_id and a.owner_id = (select auth.uid())));
create policy "assessments: coach writes on shared shots" on public.coach_assessments for insert to authenticated
  with check ((select auth.uid()) = coach_id and exists (select 1 from public.analyses a where a.id = analysis_id and a.owner_id <> (select auth.uid()) and private.can_view(a.owner_id)));
create policy "assessments: coach edits own" on public.coach_assessments for update to authenticated
  using ((select auth.uid()) = coach_id)
  with check ((select auth.uid()) = coach_id and exists (select 1 from public.analyses a where a.id = analysis_id and private.can_view(a.owner_id)));
create policy "assessments: coach deletes own" on public.coach_assessments for delete to authenticated
  using ((select auth.uid()) = coach_id);

create policy "assignments: coach and player read" on public.assignments for select to authenticated
  using ((select auth.uid()) in (coach_id, player_id));
create policy "assignments: coach assigns to linked players" on public.assignments for insert to authenticated
  with check ((select auth.uid()) = coach_id and private.can_view(player_id)
    and (analysis_id is null or exists (select 1 from public.analyses a where a.id = analysis_id and a.owner_id = player_id)));
create policy "assignments: coach or player update" on public.assignments for update to authenticated
  using ((select auth.uid()) in (coach_id, player_id)) with check ((select auth.uid()) in (coach_id, player_id));
create policy "assignments: coach deletes own" on public.assignments for delete to authenticated
  using ((select auth.uid()) = coach_id);

revoke all on public.squads, public.squad_members, public.coach_assessments, public.assignments from anon;
grant select, insert, update, delete on public.squads, public.squad_members, public.coach_assessments, public.assignments to authenticated;
