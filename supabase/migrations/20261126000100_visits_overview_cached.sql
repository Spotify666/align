-- The public Visitors page called visits_overview() on every view: a 30-day aggregate over every
-- visit. Measured on a local copy with 500,000 visits: 14 s, beyond the 3 s a signed-out call is
-- allowed, so the page would fail as the site grows. Now a background job works the answer out
-- once a minute and every reader gets the kept copy (0.3 ms on the same copy). Same JSON, same
-- callers. If the job has stopped (no copy, or one older than ten minutes), a reader works it
-- out as before, one at a time.

create schema if not exists private;

alter function public.visits_overview() rename to visits_overview_fresh;
alter function public.visits_overview_fresh() set schema private;
revoke execute on function private.visits_overview_fresh() from public, anon, authenticated;

create table private.visits_overview_cache (
  id smallint primary key default 1 check (id = 1),
  made_at timestamptz not null,
  body json not null
);
revoke all on private.visits_overview_cache from public, anon, authenticated;

create function private.visits_overview_refresh()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  fresh json := private.visits_overview_fresh();
begin
  insert into private.visits_overview_cache (id, made_at, body) values (1, now(), fresh)
    on conflict (id) do update set made_at = excluded.made_at, body = excluded.body;
  return fresh;
end
$$;
revoke execute on function private.visits_overview_refresh() from public, anon, authenticated;

create function public.visits_overview()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  kept record;
begin
  select made_at, body into kept from private.visits_overview_cache where id = 1;
  if found and (kept.made_at > now() - interval '10 minutes'
                or not pg_try_advisory_xact_lock(hashtext('aline.visits_overview'))) then
    return kept.body;
  end if;
  return private.visits_overview_refresh();
end
$$;
grant execute on function public.visits_overview() to anon, authenticated;

-- Every minute, outside any reader's request (pg_cron is already used by the retention job).
create extension if not exists pg_cron;
select cron.schedule('visits-overview-refresh', '* * * * *', 'select private.visits_overview_refresh()');
select private.visits_overview_refresh();
