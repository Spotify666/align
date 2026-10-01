-- Retention: raw video expires automatically (default 14 days, per-user setting).
-- A daily pg_cron job calls the retention-purge edge function, which deletes the
-- Storage objects through the Storage API and then the rows.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.set_media_expiry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  days smallint;
begin
  if new.bucket = 'raw-video' then
    select p.raw_video_retention_days into days from public.profiles p where p.id = new.owner_id;
    new.expires_at := now() + make_interval(days => coalesce(days, 14));
  end if;
  return new;
end;
$$;
create trigger media_objects_expiry before insert on public.media_objects
  for each row execute function private.set_media_expiry();

-- Shared secret for the cron call, stored in Vault.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'retention_cron_secret', 'Shared secret for the retention-purge edge function');

create or replace function public.verify_cron_secret(candidate text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'retention_cron_secret' and s.decrypted_secret = candidate
  );
$$;
revoke execute on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cron_secret(text) to service_role;

select cron.schedule(
  'align-retention-purge',
  '17 3 * * *',
  $$
  select net.http_post(
    url := 'https://uwhgahpsivwkvxmbchmk.supabase.co/functions/v1/retention-purge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'retention_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
