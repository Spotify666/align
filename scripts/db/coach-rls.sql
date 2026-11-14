-- The coach workspace's access rules (migration 20261114000200), checked as two coaches and
-- two players. Every check raises if it fails. Run by scripts/db/check-rls.sh.
-- C coaches P (linked, consented to share). Q is not linked to C. D is another coach.
insert into auth.users (id) values
  ('c0000000-0000-0000-0000-000000000000'), ('d0000000-0000-0000-0000-000000000000'),
  ('a0000000-0000-0000-0000-000000000001'), ('b0000000-0000-0000-0000-000000000002');
insert into public.coach_links (coach_id, player_id, status) values ('c0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'active');
insert into public.consents (user_id, kind, granted, policy_version) values ('a0000000-0000-0000-0000-000000000001', 'coach_sharing', true, 'test');
insert into public.analyses (id, owner_id, tier, mode, status, status_reason, capture_confidence, engine_version, metric_version, registry_hash, input_hash, result_hash) values
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'quick', 'video', 'valid', 'accepted', 0.9, 'x', 'x', 'x', 'x', 'p-hash'),
  ('e0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000002', 'quick', 'video', 'valid', 'accepted', 0.9, 'x', 'x', 'x', 'x', 'q-hash');

-- As coach C.
set role authenticated;
set test.uid = 'c0000000-0000-0000-0000-000000000000';
do $$ declare n int; sq uuid; begin
  insert into public.squads (name) values ('Under 15s') returning id into sq;
  insert into public.squad_members (squad_id, player_id) values (sq, 'a0000000-0000-0000-0000-000000000001');
  begin
    insert into public.squad_members (squad_id, player_id) values (sq, 'b0000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: coach added a player who is not linked';
  exception when insufficient_privilege then null;
  end;
  insert into public.coach_assessments (analysis_id, agrees, focus, notes, reviewed_at) values ('e0000000-0000-0000-0000-00000000000a', 'agree', 'alignment', 'Head falls away', now());
  begin
    insert into public.coach_assessments (analysis_id, agrees) values ('e0000000-0000-0000-0000-00000000000b', 'agree');
    raise exception 'FAIL: coach assessed an unshared shot';
  exception when insufficient_privilege then null;
  end;
  -- A coach never changes Aline's result.
  update public.analyses set status = 'uncertain_shot', result_hash = 'changed' where id = 'e0000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: coach changed an analysis'; end if;
  insert into public.assignments (player_id, analysis_id, focus, drill, retest_by) values ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'alignment', 'Mirror drill', current_date + 7);
  begin
    insert into public.assignments (player_id, focus) values ('b0000000-0000-0000-0000-000000000002', 'alignment');
    raise exception 'FAIL: coach assigned to a player who is not linked';
  exception when insufficient_privilege then null;
  end;
  -- Nor tie an assignment to another player's shot.
  begin
    insert into public.assignments (player_id, analysis_id) values ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL: assignment tied to another player''s shot';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The analysis is untouched.
do $$ begin
  if (select result_hash from public.analyses where id = 'e0000000-0000-0000-0000-00000000000a') <> 'p-hash' then raise exception 'FAIL: analysis changed'; end if;
end $$;

-- As another coach D: sees none of it, writes none of it.
set role authenticated;
set test.uid = 'd0000000-0000-0000-0000-000000000000';
do $$ declare n int; begin
  select count(*) into n from public.squads; if n <> 0 then raise exception 'FAIL D squads %', n; end if;
  select count(*) into n from public.squad_members; if n <> 0 then raise exception 'FAIL D members %', n; end if;
  select count(*) into n from public.coach_assessments; if n <> 0 then raise exception 'FAIL D assessments %', n; end if;
  select count(*) into n from public.assignments; if n <> 0 then raise exception 'FAIL D assignments %', n; end if;
  begin
    insert into public.coach_assessments (analysis_id, agrees) values ('e0000000-0000-0000-0000-00000000000a', 'disagree');
    raise exception 'FAIL: unlinked coach assessed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- As player P: reads what their coach wrote, may only mark an assignment done.
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-000000000001';
do $$ declare n int; begin
  select count(*) into n from public.coach_assessments; if n <> 1 then raise exception 'FAIL P assessments %', n; end if;
  select count(*) into n from public.assignments; if n <> 1 then raise exception 'FAIL P assignments %', n; end if;
  select count(*) into n from public.squad_members; if n <> 1 then raise exception 'FAIL P own membership %', n; end if;
  select count(*) into n from public.squads; if n <> 0 then raise exception 'FAIL P sees squads %', n; end if;
  update public.assignments set status = 'done';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL P could not mark done'; end if;
  begin
    update public.assignments set drill = 'Something easier';
    raise exception 'FAIL: player changed the drill';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.coach_assessments (analysis_id, agrees) values ('e0000000-0000-0000-0000-00000000000a', 'agree');
    raise exception 'FAIL: player wrote a coach assessment of their own shot';
  exception when insufficient_privilege then null;
  end;
  -- Their audit trail shows what was done to their records.
  select count(*) into n from public.audit_log where subject_owner = 'a0000000-0000-0000-0000-000000000001' and subject_type in ('squad_members', 'coach_assessments', 'assignments');
  if n < 4 then raise exception 'FAIL audit rows %', n; end if;
end $$;
reset role;

-- Once the player stops sharing, the coach can't assess or assign any more.
update public.coach_links set status = 'revoked' where player_id = 'a0000000-0000-0000-0000-000000000001';
set role authenticated;
set test.uid = 'c0000000-0000-0000-0000-000000000000';
do $$ begin
  begin
    insert into public.assignments (player_id, focus) values ('a0000000-0000-0000-0000-000000000001', 'footwork');
    raise exception 'FAIL: coach assigned after the link was revoked';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'coach workspace access rules: all checks passed' as result;
