-- The reference library's access rules (migration 20261114000100), checked as anon, as a signed-
-- in player and as a site admin. Every check raises if it fails. Run by scripts/db/check-rls.sh.
insert into public.site_admins values ('admin@example.com');
insert into public.reference_athletes (id, display_name, kind) values
  ('00000000-0000-0000-0000-00000000000a', 'Generated model', 'generated'),
  ('00000000-0000-0000-0000-00000000000b', 'Unsigned athlete', 'licensed_athlete');
insert into public.reference_shots (id, athlete_id, shot, axis, media, signature, engine_version, source, rights_status, permitted_use, licence_ref, rights_expires_at, visibility) values
  -- readable: granted, public, compare, no expiry
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'front_foot_defence', 'forward', 'video', '{}', 'x', 'Aline test generator', 'granted', '{compare,show_numbers}', 'generated', null, 'public'),
  -- hidden: pending rights
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'front_foot_defence', 'forward', 'video', '{}', 'x', 'Club session', 'pending', '{compare}', null, null, 'public'),
  -- hidden: expired
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'front_foot_defence', 'forward', 'video', '{}', 'x', 'Club session', 'granted', '{compare}', 'L-1', now() - interval '1 day', 'public'),
  -- hidden: granted but not for comparison
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 'front_foot_defence', 'forward', 'video', '{}', 'x', 'Club session', 'granted', '{pdf}', 'L-2', null, 'public'),
  -- hidden: private
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000b', 'front_foot_defence', 'forward', 'video', '{}', 'x', 'Club session', 'granted', '{compare}', 'L-3', null, 'private'),
  -- hidden: revoked
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000b', 'front_foot_defence', 'forward', 'video', '{}', 'x', 'Club session', 'revoked', '{compare}', 'L-4', null, 'public');
insert into public.reference_assets (shot_id, kind, storage_path, source, rights_status, permitted_use, licence_ref) values
  ('00000000-0000-0000-0000-000000000001', 'picture', 'a.jpg', 'Aline test generator', 'granted', '{show_pictures}', 'generated'),
  ('00000000-0000-0000-0000-000000000001', 'picture', 'b.jpg', 'Aline test generator', 'pending', '{show_pictures}', null),
  -- its own rights are granted, its shot's are not: hidden
  ('00000000-0000-0000-0000-000000000002', 'picture', 'c.jpg', 'Club session', 'granted', '{show_pictures}', 'L-5');

do $$
declare n int;
begin
  -- A granted row must name its licence.
  begin
    insert into public.reference_shots (athlete_id, shot, media, signature, engine_version, source, rights_status, permitted_use)
      values ('00000000-0000-0000-0000-00000000000a', 'front_foot_defence', 'video', '{}', 'x', 'No licence', 'granted', '{compare}');
    raise exception 'FAIL: granted without a licence was accepted';
  exception when check_violation then null;
  end;
end $$;

-- As anyone (signed out).
set role anon;
do $$ declare n int; begin
  select count(*) into n from public.reference_shots; if n <> 1 then raise exception 'FAIL anon shots: %', n; end if;
  select count(*) into n from public.reference_athletes; if n <> 1 then raise exception 'FAIL anon athletes: %', n; end if;
  select count(*) into n from public.reference_assets; if n <> 1 then raise exception 'FAIL anon assets: %', n; end if;
  begin
    insert into public.reference_athletes (display_name, kind) values ('x', 'generated');
    raise exception 'FAIL anon could write';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- As a signed-in player.
set role authenticated;
set test.email = 'player@example.com';
do $$ declare n int; begin
  select count(*) into n from public.reference_shots; if n <> 1 then raise exception 'FAIL player shots: %', n; end if;
  select count(*) into n from public.reference_assets; if n <> 1 then raise exception 'FAIL player assets: %', n; end if;
  begin
    insert into public.reference_athletes (display_name, kind) values ('x', 'generated');
    raise exception 'FAIL player could write';
  exception when insufficient_privilege then null;
  end;
  update public.reference_shots set rights_status = 'granted', licence_ref = 'mine' where id = '00000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL player changed rights'; end if;
end $$;
reset role;

-- As a site admin: everything, and writes.
set role authenticated;
set test.email = 'admin@example.com';
do $$ declare n int; begin
  select count(*) into n from public.reference_shots; if n <> 6 then raise exception 'FAIL admin shots: %', n; end if;
  select count(*) into n from public.reference_assets; if n <> 3 then raise exception 'FAIL admin assets: %', n; end if;
  update public.reference_shots set rights_status = 'revoked' where id = '00000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL admin could not revoke'; end if;
end $$;
reset role;

-- Revoked: gone for everyone else, with its pictures.
set role anon;
do $$ declare n int; begin
  select count(*) into n from public.reference_shots; if n <> 0 then raise exception 'FAIL after revoke shots: %', n; end if;
  select count(*) into n from public.reference_assets; if n <> 0 then raise exception 'FAIL after revoke assets: %', n; end if;
end $$;
reset role;

select 'reference library access rules: all checks passed' as result;
