-- Undoes 20261114000300_guardian_consent: can_view and redeem_coach_invite as in
-- 20261001000200_security, and is_minor removed. Read README.md first.
begin;

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

drop function if exists private.is_minor(uuid);

commit;
