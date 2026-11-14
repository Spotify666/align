-- Undoes 20261114000100_reference_library. Deletes every recorded reference and its
-- permission record. Read README.md first.
-- Needs 20261114000200_coach_workspace rolled back first (an assignment may point to a reference).
begin;
drop policy if exists reference_athletes_read on public.reference_athletes;
drop table if exists public.reference_assets;
drop table if exists public.reference_shots;
drop table if exists public.reference_athletes;
drop function if exists public.reference_rights_ok(text, text[], timestamptz, text);
commit;
