-- The parts of Supabase a migration's access rules rely on, for checking them on a plain local
-- Postgres (scripts/db/check-rls.sh): the anon and authenticated roles, auth.uid(), auth.jwt()
-- read from settings, auth.users, and the site_admins table with is_site_admin().
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth, public to anon, authenticated;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('test.email', true)) $$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
create table public.site_admins (email text primary key check (email = lower(email)));
alter table public.site_admins enable row level security;
create function public.is_site_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.site_admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;
