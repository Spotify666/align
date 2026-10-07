-- The full visitor table (every visit, with IP and place) for whoever holds the private
-- link's key; the public page shows totals only. Keys are stored as SHA-256 hashes, added by
-- hand (never committed), and checked by visits_full.

create table public.visit_keys (key_hash text primary key);
alter table public.visit_keys enable row level security;

create function public.visits_full(p_key text, p_offset integer default 0, p_limit integer default 100)
returns table (
  id uuid,
  visitor text,
  started_at timestamptz,
  last_seen_at timestamptz,
  active_ms integer,
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
  paths text[],
  events jsonb
)
language sql stable security definer set search_path = '' as $$
  select v.id, left(md5(v.visitor_id), 8), v.started_at, v.last_seen_at, v.active_ms, v.ip, v.country, v.region, v.city,
    v.device, v.os, v.browser, v.screen, v.lang, v.referrer, v.paths, v.events
  from public.visits v
  where exists (select 1 from public.visit_keys k where k.key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex'))
  order by v.started_at desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
$$;
grant execute on function public.visits_full(text, integer, integer) to anon, authenticated;
