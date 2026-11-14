-- Players under 18 (migration 20261114000300): no coach link and no coach access without a
-- parent's or guardian's recorded agreement. Run by scripts/db/check-rls.sh after coach-rls.sql.
-- M is under 18; C2 is a coach with an invite code.
insert into auth.users (id) values ('f0000000-0000-0000-0000-00000000000e'), ('c2000000-0000-0000-0000-000000000000');
insert into public.profiles (id, is_minor) values ('f0000000-0000-0000-0000-00000000000e', true);
insert into public.coach_invites (code, coach_id) values ('minorcode', 'c2000000-0000-0000-0000-000000000000');
insert into public.analyses (id, owner_id, tier, mode, status, status_reason, capture_confidence, engine_version, metric_version, registry_hash, input_hash, result_hash) values
  ('e0000000-0000-0000-0000-00000000000e', 'f0000000-0000-0000-0000-00000000000e', 'quick', 'video', 'valid', 'accepted', 0.9, 'x', 'x', 'x', 'x', 'm-hash');

set role authenticated;
set test.uid = 'f0000000-0000-0000-0000-00000000000e';
do $$ begin
  begin
    perform public.redeem_coach_invite('minorcode');
    raise exception 'FAIL: a player under 18 linked a coach without a guardian';
  exception when raise_exception then
    if sqlerrm <> 'guardian_consent_required' then raise; end if;
  end;
  insert into public.consents (user_id, kind, granted, policy_version) values ('f0000000-0000-0000-0000-00000000000e', 'guardian', true, 'test');
  perform public.redeem_coach_invite('minorcode');
end $$;
reset role;

set role authenticated;
set test.uid = 'c2000000-0000-0000-0000-000000000000';
do $$ declare n int; begin
  select count(*) into n from public.analyses where owner_id = 'f0000000-0000-0000-0000-00000000000e';
  if n <> 1 then raise exception 'FAIL coach should see the shot once a guardian agreed: %', n; end if;
end $$;
reset role;

-- The guardian's agreement withdrawn: the coach sees nothing again.
insert into public.consents (user_id, kind, granted, policy_version) values ('f0000000-0000-0000-0000-00000000000e', 'guardian', false, 'test');
set role authenticated;
set test.uid = 'c2000000-0000-0000-0000-000000000000';
do $$ declare n int; begin
  select count(*) into n from public.analyses where owner_id = 'f0000000-0000-0000-0000-00000000000e';
  if n <> 0 then raise exception 'FAIL coach still sees a minor''s shot after the guardian withdrew: %', n; end if;
  begin
    insert into public.coach_assessments (analysis_id, agrees) values ('e0000000-0000-0000-0000-00000000000e', 'agree');
    raise exception 'FAIL: coach assessed a minor''s shot without a guardian';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'guardian consent rules: all checks passed' as result;
