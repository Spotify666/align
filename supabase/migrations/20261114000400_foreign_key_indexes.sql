-- Batch 8 hardening: indexes for the three foreign keys the database advisor found without one
-- (a delete of an analysis or a reference, and the coach's look-ups, no longer scan the table).
-- Additive only; dropped with their tables by supabase/rollback/*.down.sql.
create index if not exists assignments_analysis on public.assignments (analysis_id);
create index if not exists assignments_reference_shot on public.assignments (reference_shot_id);
create index if not exists reference_shots_athlete on public.reference_shots (athlete_id);
