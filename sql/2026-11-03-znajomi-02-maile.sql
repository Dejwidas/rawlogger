-- rawlogger — e-mail z zaproszeniem do znajomych
-- 2026-11-03
--
-- URUCHOM PRZED wdrożeniem kodu z feat/friend-email-invites. Same dodatki.
--
-- Mail wysyła serwer aplikacji (/api/friends/invite-email) przez SMTP,
-- ale tylko po zgodzie tej funkcji:
--   * istnieje zaproszenie od zalogowanej osoby na ten adres
--   * na to zaproszenie nie wysłano jeszcze maila (jeden mail na adres)
--   * zalogowana osoba wysłała w ciągu doby mniej niż 10 maili
-- Mail idzie także do osób, które mają konto, więc jego wysłanie niczego
-- nie zdradza. Link w mailu to osobisty link zaproszenia nadawcy.
-- Bezpieczne do powtórzenia.

begin;

alter table public.friend_requests add column if not exists email_sent_at timestamptz;
create index if not exists friend_requests_email_sent_idx
  on public.friend_requests (from_user, email_sent_at) where email_sent_at is not null;


-- Zwraca {"ok": true, "name": "...", "token": "..."}
-- albo {"ok": false, "reason": "no_request" | "already_sent" | "limit"}.
create or replace function public.claim_invite_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_id    uuid;
  v_sent  timestamptz;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  select r.id, r.email_sent_at into v_id, v_sent
  from public.friend_requests r
  where r.from_user = v_uid and r.to_email = v_email
  for update;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_request');
  end if;

  if v_sent is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_sent');
  end if;

  if (select count(*) from public.friend_requests r
      where r.from_user = v_uid and r.email_sent_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;

  update public.friend_requests r set email_sent_at = now() where r.id = v_id;

  return jsonb_build_object(
    'ok', true,
    'name', public.display_name(v_uid),
    'token', public.get_friend_invite_link(false)
  );
end $$;


-- Cofa znacznik, gdy wysyłka się nie udała, żeby można było spróbować ponownie.
create or replace function public.release_invite_email(p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.friend_requests r
  set email_sent_at = null
  where r.from_user = auth.uid() and r.to_email = lower(btrim(p_email))
$$;

revoke all on function public.claim_invite_email(text) from public;
revoke all on function public.release_invite_email(text) from public;
grant execute on function public.claim_invite_email(text) to authenticated;
grant execute on function public.release_invite_email(text) to authenticated;

commit;

notify pgrst, 'reload schema';


-- Weryfikacja: jeden wiersz, column = 1, functions = 2.
select
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'friend_requests' and column_name = 'email_sent_at') as column,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('claim_invite_email', 'release_invite_email')) as functions;
