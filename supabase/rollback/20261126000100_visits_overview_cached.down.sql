-- Undo 20261126000100: visits_overview() computes on every call again. Loses only the kept copy.
select cron.unschedule('visits-overview-refresh');
drop function public.visits_overview();
drop function private.visits_overview_refresh();
drop table private.visits_overview_cache;
alter function private.visits_overview_fresh() set schema public;
alter function public.visits_overview_fresh() rename to visits_overview;
grant execute on function public.visits_overview() to anon, authenticated;
