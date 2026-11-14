-- Undoes 20261114000200_coach_workspace. Deletes every squad, assessment and assignment:
-- export them from /coach first. Read README.md first.
begin;
drop table if exists public.assignments;
drop table if exists public.coach_assessments;
drop table if exists public.squad_members;
drop table if exists public.squads;
drop function if exists private.guard_assignment_update();
drop function if exists private.audit_coach_work();
commit;
