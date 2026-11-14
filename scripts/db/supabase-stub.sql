-- The parts of Supabase a migration's access rules rely on, for checking them on a plain local
-- Postgres (scripts/db/check-rls.sh): the anon and authenticated roles, auth.uid(), auth.jwt()
-- read from settings, auth.users, the site_admins table with is_site_admin(), and enough of
-- storage for the core migrations.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
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
-- Storage, enough for the core migrations' buckets and policies.
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- Supabase grants table access to its API roles by default; row-level security then decides.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
