-- After supabase/rollback/*.down.sql (newest first): the three migrations' tables and functions
-- are gone, the core tables and their rows are untouched, and the core sharing rule works as
-- before the guardian rule. Run by scripts/db/check-rls.sh --rollback.
do $$ begin
  if to_regclass('public.reference_shots') is not null or to_regclass('public.reference_athletes') is not null
     or to_regclass('public.reference_assets') is not null then raise exception 'FAIL reference tables still there'; end if;
  if to_regclass('public.squads') is not null or to_regclass('public.squad_members') is not null
     or to_regclass('public.coach_assessments') is not null or to_regclass('public.assignments') is not null then
    raise exception 'FAIL coach workspace tables still there'; end if;
  if to_regprocedure('private.is_minor(uuid)') is not null then raise exception 'FAIL is_minor still there'; end if;
  if to_regprocedure('public.reference_rights_ok(text, text[], timestamptz, text)') is not null then raise exception 'FAIL reference_rights_ok still there'; end if;
  if to_regprocedure('private.audit_coach_work()') is not null or to_regprocedure('private.guard_assignment_update()') is not null then
    raise exception 'FAIL coach workspace functions still there'; end if;
  if (select count(*) from public.analyses) = 0 then raise exception 'FAIL analyses lost'; end if;
  if (select count(*) from public.audit_log) = 0 then raise exception 'FAIL audit history lost'; end if;
end $$;

-- The minor's shot (guardian-rls.sql): with the guardian rule gone, a linked coach with the
-- player's coach_sharing consent sees it again, exactly as the core rule says.
set role authenticated;
set test.uid = 'c2000000-0000-0000-0000-000000000000';
do $$ declare n int; begin
  select count(*) into n from public.analyses where owner_id = 'f0000000-0000-0000-0000-00000000000e';
  if n <> 1 then raise exception 'FAIL core sharing rule after rollback: %', n; end if;
end $$;
reset role;

-- Inviting a coach works without the guardian check.
insert into auth.users (id) values ('f0000000-0000-0000-0000-0000000000ff');
insert into public.coach_invites (code, coach_id) values ('afterrollback', 'c2000000-0000-0000-0000-000000000000');
set role authenticated;
set test.uid = 'f0000000-0000-0000-0000-0000000000ff';
select public.redeem_coach_invite('afterrollback') is not null as linked;
reset role;

select 'rollback: all checks passed' as result;
