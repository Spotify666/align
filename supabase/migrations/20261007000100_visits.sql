-- Visitor log: one row per visit (a browser tab's session). Written only through
-- record_visit, which /api/visit calls after dropping bots and adding the place and IP
-- from the host's headers; read only by the site's admins (the owner).

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  visitor_id text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_ms integer not null default 0 check (active_ms >= 0),
  ip text,
  country text,
  region text,
  city text,
  device text,
  os text,
  browser text,
  screen text,
  lang text,
  referrer text,
  paths text[] not null default '{}',
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array')
);
create index visits_started_idx on public.visits (started_at desc);
create index visits_ip_idx on public.visits (ip, started_at desc);
alter table public.visits enable row level security;

-- Who may read the log: emails of signed-in owners. No policies, so no one reads or writes
-- this table directly; is_site_admin() checks it.
create table public.site_admins (email text primary key check (email = lower(email)));
alter table public.site_admins enable row level security;

create function public.is_site_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.site_admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

create policy visits_admin_read on public.visits for select to authenticated using ((select public.is_site_admin()));
create policy visits_admin_delete on public.visits for delete to authenticated using ((select public.is_site_admin()));

-- Insert or update a visit. Repeated calls for the same session carry the whole visit so far
-- (beacons can be lost), so the longer lists and the larger time win. Time spent can't grow
-- faster than the clock. New visits are limited per IP and per day, and visits older than
-- 180 days are removed.
create function public.record_visit(
  p_session text,
  p_visitor text,
  p_active_ms integer,
  p_ip text,
  p_country text,
  p_region text,
  p_city text,
  p_device text,
  p_os text,
  p_browser text,
  p_screen text,
  p_lang text,
  p_referrer text,
  p_paths text[],
  p_events jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
  v_events jsonb;
  v_active integer := least(greatest(coalesce(p_active_ms, 0), 0), 30 * 60 * 1000);
begin
  if p_session is null or p_visitor is null or p_session !~ '^[A-Za-z0-9-]{8,64}$' or p_visitor !~ '^[A-Za-z0-9-]{8,64}$' then
    return;
  end if;
  v_paths := coalesce((select array_agg(left(x, 120)) from (select unnest(p_paths) as x limit 40) s), '{}');
  v_events := case
    when p_events is null or jsonb_typeof(p_events) <> 'array' or octet_length(p_events::text) > 20000 then '[]'::jsonb
    else coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(p_events) e limit 150) s), '[]'::jsonb)
  end;

  if not exists (select 1 from public.visits where session_id = p_session) then
    if p_ip is not null and (select count(*) from public.visits where ip = p_ip and started_at > now() - interval '1 hour') >= 30 then
      return;
    end if;
    if (select count(*) from public.visits where started_at > now() - interval '1 day') >= 5000 then
      return;
    end if;
    delete from public.visits where started_at < now() - interval '180 days';
  end if;

  insert into public.visits as v (session_id, visitor_id, active_ms, ip, country, region, city, device, os, browser, screen, lang, referrer, paths, events)
  values (
    p_session, p_visitor, v_active, left(p_ip, 64), left(p_country, 8), left(p_region, 64), left(p_city, 80),
    left(p_device, 80), left(p_os, 40), left(p_browser, 40), left(p_screen, 20), left(p_lang, 20), left(p_referrer, 120),
    v_paths, v_events
  )
  on conflict (session_id) do update set
    last_seen_at = now(),
    active_ms = greatest(v.active_ms, least(excluded.active_ms, v.active_ms + (extract(epoch from now() - v.last_seen_at) * 1000)::integer + 5000)),
    paths = case when cardinality(excluded.paths) >= cardinality(v.paths) then excluded.paths else v.paths end,
    events = case when jsonb_array_length(excluded.events) >= jsonb_array_length(v.events) then excluded.events else v.events end
  where v.visitor_id = excluded.visitor_id;
end $$;
revoke all on function public.record_visit(text, text, integer, text, text, text, text, text, text, text, text, text, text, text[], jsonb) from public;
grant execute on function public.record_visit(text, text, integer, text, text, text, text, text, text, text, text, text, text, text[], jsonb) to anon, authenticated;

-- Totals for the visitors page (row-level security applies: zeros for anyone but an admin).
create function public.visit_stats() returns json
language sql stable security invoker set search_path = '' as $$
  select json_build_object(
    'day', (select json_build_object('visits', count(*), 'visitors', count(distinct visitor_id), 'median_ms', percentile_cont(0.5) within group (order by active_ms))
            from public.visits where started_at > now() - interval '1 day'),
    'week', (select json_build_object('visits', count(*), 'visitors', count(distinct visitor_id), 'median_ms', percentile_cont(0.5) within group (order by active_ms))
             from public.visits where started_at > now() - interval '7 days'),
    'month', (select json_build_object('visits', count(*), 'visitors', count(distinct visitor_id), 'median_ms', percentile_cont(0.5) within group (order by active_ms))
              from public.visits where started_at > now() - interval '30 days')
  )
$$;
revoke all on function public.visit_stats() from public, anon;
grant execute on function public.visit_stats() to authenticated;

-- A header probe made while building this (never used by the app).
drop function if exists public.zz_debug_headers();
