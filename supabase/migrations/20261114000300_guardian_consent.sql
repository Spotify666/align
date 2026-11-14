-- Players under 18 (decision 13, the owner's answer of 2026-11-14: "Ask a parent first"): a
-- player whose profile says they are under 18 can't link a coach, and a coach sees nothing of
-- theirs, until the player has recorded that a parent or guardian agreed (a 'guardian'
-- consent, latest one wins, like every consent). Withdrawing it hides their shots from coaches
-- again at once. Legal advice for the markets served is still to be taken.

create or replace function private.is_minor(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.is_minor from public.profiles p where p.id = uid), false);
$$;
grant execute on function private.is_minor(uuid) to authenticated;

-- Owner, or an active coach the owner has consented to share with (and, under 18, a guardian too).
create or replace function private.can_view(owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) = owner
    or (
      exists (
        select 1 from public.coach_links l
        where l.coach_id = (select auth.uid()) and l.player_id = owner and l.status = 'active'
      )
      and private.has_consent(owner, 'coach_sharing')
      and (not private.is_minor(owner) or private.has_consent(owner, 'guardian'))
    );
$$;

create or replace function public.redeem_coach_invite(invite_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  coach uuid;
begin
  select i.coach_id into coach from public.coach_invites i
  where i.code = invite_code and i.expires_at > now();
  if coach is null then
    raise exception 'invite code not found or expired';
  end if;
  if coach = (select auth.uid()) then
    raise exception 'you cannot link to yourself';
  end if;
  if private.is_minor((select auth.uid())) and not private.has_consent((select auth.uid()), 'guardian') then
    raise exception 'guardian_consent_required' using hint = 'A parent or guardian must agree before a player under 18 links a coach.';
  end if;
  insert into public.coach_links (coach_id, player_id, status)
  values (coach, (select auth.uid()), 'active')
  on conflict (coach_id, player_id) do update set status = 'active';
  insert into public.consents (user_id, kind, granted, policy_version)
  values ((select auth.uid()), 'coach_sharing', true, 'privacy-2026-10');
  return coach;
end;
$$;
revoke execute on function public.redeem_coach_invite(text) from public, anon;
grant execute on function public.redeem_coach_invite(text) to authenticated;
