-- The visitors page is open to anyone, so it shows totals only: counts of people, visits,
-- time, countries, kinds of device, systems, browsers, where they came from, pages and what
-- they did. No IPs, cities, device models or single visits leave the database; the table
-- itself stays closed to the API.

create function public.visits_overview() returns json
language sql stable security definer set search_path = '' as $$
  with m as (
    select * from public.visits where started_at > now() - interval '30 days'
  ),
  ev as (
    select e ->> 'k' as k, e ->> 'd' as d from m, jsonb_array_elements(m.events) e
  ),
  top as (
    select 'countries' as list, coalesce(country, '?') as k, count(distinct visitor_id) as n from m group by 2
    union all
    select 'devices', coalesce(split_part(device, ' · ', 1), '?'), count(distinct visitor_id) from m group by 2
    union all
    select 'systems', coalesce(regexp_replace(os, '\s[\d.]+$', ''), '?'), count(distinct visitor_id) from m group by 2
    union all
    select 'browsers', coalesce(regexp_replace(browser, '\s\d+$', ''), '?'), count(distinct visitor_id) from m group by 2
    union all
    select 'sources', coalesce(referrer, 'direct'), count(*) from m group by 2
    union all
    select 'pages', regexp_replace(p, '^/(report|sample)/.+$', '/\1/…'), count(distinct m.id) from m, unnest(m.paths) p group by 2
    union all
    select 'results', split_part(d, ' · ', 1), count(*) from ev where k = 'result' group by 2
    union all
    select 'failures', d, count(*) from ev where k = 'failed' group by 2
    union all
    select 'taps', d, count(*) from ev where k = 'tap' group by 2
  ),
  ranked as (
    select list, k, n, row_number() over (partition by list order by n desc, k) as r from top
  )
  select json_build_object(
    'day', (select json_build_object('visits', count(*), 'visitors', count(distinct visitor_id), 'median_ms', percentile_cont(0.5) within group (order by active_ms))
            from public.visits where started_at > now() - interval '1 day'),
    'week', (select json_build_object('visits', count(*), 'visitors', count(distinct visitor_id), 'median_ms', percentile_cont(0.5) within group (order by active_ms))
             from public.visits where started_at > now() - interval '7 days'),
    'month', (select json_build_object('visits', count(*), 'visitors', count(distinct visitor_id), 'median_ms', percentile_cont(0.5) within group (order by active_ms))
              from m),
    'analyses', (select count(*) from ev where k = 'analyse'),
    'lists', (select coalesce(json_object_agg(list, items), '{}'::json) from (
      select list, json_agg(json_build_object('k', k, 'n', n) order by r) as items from ranked where r <= 8 group by list
    ) l)
  )
$$;
grant execute on function public.visits_overview() to anon, authenticated;
