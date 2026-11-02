-- rawlogger — znajomi: zaproszenia, lista i podgląd kalendarza
-- 2026-11-02
--
-- URUCHOM PRZED wdrożeniem kodu z feat/friends. Same dodatki, obecny kod
-- działa bez zmian.
--
-- Model:
--   * znajomość jest symetryczna: jeden wiersz (user_a < user_b)
--   * zaproszenie po e-mailu zapisuje się zawsze, także na adres bez konta,
--     i czeka. Odpowiedź jest taka sama, więc nie da się sprawdzić, kto ma
--     konto. Zaproszenia odbiera się po e-mailu z auth.users.
--   * osobisty link (jak w Garminie): kto go otworzy i zaakceptuje, zostaje
--     znajomym od razu, bo właściciel linku zgodził się, wysyłając go.
--   * podpis to pseudonim, a bez niego stała nazwa zwierzę_numer z id konta.
--     E-maile nie wychodzą do innych użytkowników.
--   * kalendarz znajomego: daty i serie z ciężarami, bez notatek dnia,
--     notatek serii i dopisków o przerwie.
--
-- Tabele nie mają polityk INSERT: zapis idzie przez funkcje SECURITY
-- DEFINER scopowane po auth.uid(). Polityki SELECT i DELETE obejmują tylko
-- własne wiersze i służą usuwaniu konta.
--
-- Przy okazji katalog planów i strona linku podpisują autora tak samo jak
-- znajomych: pseudonim albo zwierzę_numer zamiast „Anonim”, żeby plany
-- o tej samej nazwie dało się odróżnić. Bezpieczne do powtórzenia.

begin;

create table if not exists public.friendships (
  user_a     uuid not null references auth.users (id) on delete cascade,
  user_b     uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_order check (user_a < user_b)
);
create index if not exists friendships_user_b_idx on public.friendships (user_b);

create table if not exists public.friend_requests (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references auth.users (id) on delete cascade,
  to_email   text not null,
  created_at timestamptz not null default now(),
  constraint friend_requests_email_check check (
    to_email = lower(btrim(to_email))
    and position('@' in to_email) > 1
    and char_length(to_email) <= 254
  ),
  constraint friend_requests_unique unique (from_user, to_email)
);
create index if not exists friend_requests_to_email_idx on public.friend_requests (to_email);

create table if not exists public.friend_invite_links (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      text not null unique check (char_length(token) >= 24),
  created_at timestamptz not null default now()
);

alter table public.friendships         enable row level security;
alter table public.friend_requests     enable row level security;
alter table public.friend_invite_links enable row level security;

-- DELETE z warunkiem wymaga też polityki SELECT, inaczej usuwa 0 wierszy.
-- Odczyt obejmuje tylko własne wiersze; cudzych danych nie odsłania.
drop policy if exists own_select on public.friendships;
drop policy if exists own_select on public.friend_requests;
drop policy if exists own_select on public.friend_invite_links;
create policy own_select on public.friendships for select using (auth.uid() in (user_a, user_b));
create policy own_select on public.friend_requests for select using (auth.uid() = from_user);
create policy own_select on public.friend_invite_links for select using (auth.uid() = user_id);

drop policy if exists own_delete on public.friendships;
drop policy if exists own_delete on public.friend_requests;
drop policy if exists own_delete on public.friend_invite_links;
create policy own_delete on public.friendships for delete using (auth.uid() in (user_a, user_b));
create policy own_delete on public.friend_requests for delete using (auth.uid() = from_user);
create policy own_delete on public.friend_invite_links for delete using (auth.uid() = user_id);

revoke all on public.friendships, public.friend_requests, public.friend_invite_links from anon;


-- Pomocnicze, tylko do użytku wewnątrz funkcji poniżej.

-- Pseudonim albo stała nazwa z pierwszych cyfr id (np. dzik_482).
create or replace function public.display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(btrim(up.nickname), '') from public.user_profiles up where up.id = p_user),
    (array['dzik','żubr','łoś','bóbr','lis','wilk','borsuk','jeż','ryś','sokół',
           'kruk','sum','szczupak','niedźwiedź','jeleń','sarna','zając','kuna','wydra','orzeł'])
      [1 + (('x' || lpad(substr(replace(p_user::text, '-', ''), 1, 7), 8, '0'))::bit(32)::int % 20)]
    || '_' ||
    lpad(((('x' || lpad(substr(replace(p_user::text, '-', ''), 8, 7), 8, '0'))::bit(32)::int % 1000))::text, 3, '0')
  )
$$;

create or replace function public.my_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid()
$$;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_a = least(p_a, p_b) and f.user_b = greatest(p_a, p_b)
  )
$$;

-- Zakłada znajomość i sprząta zaproszenia w obie strony.
create or replace function public.make_friends(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.friendships (user_a, user_b)
  values (least(p_a, p_b), greatest(p_a, p_b))
  on conflict do nothing;

  delete from public.friend_requests r
  where (r.from_user = p_a and r.to_email = (select lower(u.email) from auth.users u where u.id = p_b))
     or (r.from_user = p_b and r.to_email = (select lower(u.email) from auth.users u where u.id = p_a));
end $$;

revoke all on function public.display_name(uuid) from public, anon, authenticated;
revoke all on function public.my_email() from public, anon, authenticated;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.make_friends(uuid, uuid) from public, anon, authenticated;


-- Zaproszenie po e-mailu.
-- Zwraca {"ok": true, "status": "sent" | "accepted" | "already_friends"}
-- albo {"ok": false, "reason": "invalid" | "self" | "limit"}.
create or replace function public.send_friend_request(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_to    uuid;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  if v_email is null or position('@' in v_email) < 2 or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if v_email = public.my_email() then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  select u.id into v_to from auth.users u where lower(u.email) = v_email;

  if v_to is not null then
    if public.are_friends(v_uid, v_to) then
      return jsonb_build_object('ok', true, 'status', 'already_friends');
    end if;

    -- Ta osoba już zaprosiła mnie: zaproszenie w drugą stronę to akceptacja.
    if exists (select 1 from public.friend_requests r
               where r.from_user = v_to and r.to_email = public.my_email()) then
      perform public.make_friends(v_uid, v_to);
      return jsonb_build_object('ok', true, 'status', 'accepted');
    end if;
  end if;

  if (select count(*) from public.friend_requests r where r.from_user = v_uid) >= 50 then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;

  insert into public.friend_requests (from_user, to_email)
  values (v_uid, v_email)
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'status', 'sent');
end $$;


-- Wszystko na stronę Znajomi jednym wywołaniem.
create or replace function public.friend_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := public.my_email();
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'since', x.since) order by lower(x.name))
      from (
        select case when f.user_a = v_uid then f.user_b else f.user_a end as id,
               public.display_name(case when f.user_a = v_uid then f.user_b else f.user_a end) as name,
               f.created_at as since
        from public.friendships f
        where v_uid in (f.user_a, f.user_b)
      ) x
    ), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', public.display_name(r.from_user)) order by r.created_at)
      from public.friend_requests r
      where r.to_email = v_email
        and r.from_user <> v_uid
        and not public.are_friends(v_uid, r.from_user)
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'email', r.to_email) order by r.created_at)
      from public.friend_requests r
      where r.from_user = v_uid
    ), '[]'::jsonb)
  );
end $$;


-- Liczba zaproszeń czekających na mnie (plakietka w nagłówku).
create or replace function public.friend_request_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.friend_requests r
  where r.to_email = public.my_email()
    and r.from_user <> auth.uid()
    and not public.are_friends(auth.uid(), r.from_user)
$$;


-- Akceptacja lub odrzucenie zaproszenia, które przyszło do mnie.
create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_from uuid;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  select r.from_user into v_from
  from public.friend_requests r
  where r.id = p_id and r.to_email = public.my_email();

  if v_from is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_accept then
    perform public.make_friends(v_uid, v_from);
  else
    delete from public.friend_requests r where r.id = p_id;
  end if;

  return jsonb_build_object('ok', true);
end $$;


create or replace function public.cancel_friend_request(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friend_requests r where r.id = p_id and r.from_user = auth.uid()
$$;


create or replace function public.remove_friend(p_friend uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friendships f
  where f.user_a = least(auth.uid(), p_friend) and f.user_b = greatest(auth.uid(), p_friend)
$$;


-- Osobisty link: tworzony przy pierwszym użyciu, wymiana unieważnia stary.
create or replace function public.get_friend_invite_link(p_reset boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  insert into public.friend_invite_links as l (user_id, token)
  values (v_uid, replace(gen_random_uuid()::text, '-', ''))
  on conflict (user_id) do update
    set token = case when p_reset then excluded.token else l.token end,
        created_at = case when p_reset then now() else l.created_at end
  returning l.token into v_token;

  return v_token;
end $$;


-- Podgląd linku: kto zaprasza. Działa też bez logowania (potem logowanie).
-- Zwraca NULL dla nieznanego tokenu.
create or replace function public.get_friend_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select l.user_id into v_owner from public.friend_invite_links l where l.token = p_token;
  if v_owner is null then
    return null;
  end if;

  return jsonb_build_object(
    'name', public.display_name(v_owner),
    'is_self', coalesce(v_owner = auth.uid(), false),
    'already_friends', coalesce(public.are_friends(auth.uid(), v_owner), false)
  );
end $$;


-- Zwraca {"ok": true, "status": "accepted" | "already_friends"}
-- albo {"ok": false, "reason": "not_found" | "self"}.
create or replace function public.accept_friend_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  select l.user_id into v_owner from public.friend_invite_links l where l.token = p_token;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_owner = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  if public.are_friends(v_uid, v_owner) then
    return jsonb_build_object('ok', true, 'status', 'already_friends');
  end if;

  perform public.make_friends(v_uid, v_owner);
  return jsonb_build_object('ok', true, 'status', 'accepted');
end $$;


-- Kalendarz znajomego. Każda funkcja sprawdza znajomość i odrzuca resztę.
create or replace function public.get_friend(p_friend uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.are_friends(auth.uid(), p_friend)
    then jsonb_build_object('id', p_friend, 'name', public.display_name(p_friend))
  end
$$;

-- Tablica dat ["2026-11-01", ...] z treningami w zakresie.
create or replace function public.friend_training_days(p_friend uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.are_friends(auth.uid(), p_friend) then
    raise exception 'nie jesteście znajomymi' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(d.date order by d.date)
    from (
      select distinct ts.date
      from public.training_sets ts
      where ts.user_id = p_friend and ts.date between p_from and p_to
    ) d
  ), '[]'::jsonb);
end $$;

-- Serie jednego dnia, bez set_note i rest_note.
create or replace function public.friend_training_day(p_friend uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.are_friends(auth.uid(), p_friend) then
    raise exception 'nie jesteście znajomymi' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'exercise_name', e.name,
      'set_type', ts.set_type,
      'weight', ts.weight,
      'reps_arr', ts.reps_arr,
      'bw_reps', ts.bw_reps,
      'timed_seconds', ts.timed_seconds,
      'wt_seconds', ts.wt_seconds
    ) order by ts.display_order nulls last, ts.created_at)
    from public.training_sets ts
    join public.exercises e on e.id = ts.exercise_id
    where ts.user_id = p_friend and ts.date = p_date
  ), '[]'::jsonb);
end $$;


-- Plany: autor zawsze z display_name. Reszta bez zmian względem
-- 2026-11-02-plany-01-udostepnianie.sql.
create or replace function public.get_shared_plan(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan public.training_plans;
  v_votes int;
  v_imports int;
begin
  select * into v_plan
  from public.training_plans tp
  where tp.share_token = p_token and (tp.link_shared or tp.is_public);

  if not found then
    return null;
  end if;

  select count(*) into v_votes from public.plan_votes pv where pv.plan_id = v_plan.id;
  select count(*) into v_imports from public.plan_imports pi where pi.plan_id = v_plan.id;

  return jsonb_build_object(
    'token',     v_plan.share_token,
    'title',     v_plan.title,
    'is_public', v_plan.is_public,
    'author',    public.display_name(v_plan.user_id),
    'is_mine',   coalesce(v_plan.user_id = v_uid, false),
    'my_vote',   exists (select 1 from public.plan_votes pv
                         where pv.plan_id = v_plan.id and pv.user_id = v_uid),
    'votes',     v_votes,
    'imports',   v_imports,
    'score',     v_votes + 2 * v_imports,
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object('name', e.name, 'note', pe.note)
                       order by pe.position, pe.id)
      from public.plan_exercises pe
      join public.exercises e on e.id = pe.exercise_id
      where pe.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.plan_catalog(p_query text default null)
returns table (
  token text, title text, author text, exercises integer,
  votes integer, imports integer, score integer,
  my_vote boolean, is_mine boolean, published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    tp.share_token,
    tp.title,
    public.display_name(tp.user_id),
    ex.c,
    v.c,
    i.c,
    v.c + 2 * i.c,
    exists (select 1 from public.plan_votes pv
            where pv.plan_id = tp.id and pv.user_id = auth.uid()),
    tp.user_id = auth.uid(),
    tp.published_at
  from public.training_plans tp
  cross join lateral (select count(*)::integer c from public.plan_exercises pe where pe.plan_id = tp.id) ex
  cross join lateral (select count(*)::integer c from public.plan_votes pv where pv.plan_id = tp.id) v
  cross join lateral (select count(*)::integer c from public.plan_imports pi where pi.plan_id = tp.id) i
  where tp.is_public
    and ex.c > 0
    and (nullif(btrim(p_query), '') is null
         or strpos(lower(tp.title), lower(btrim(p_query))) > 0)
  order by v.c + 2 * i.c desc, tp.published_at desc nulls last, tp.id
  limit 100
$$;


revoke all on function public.send_friend_request(text) from public;
revoke all on function public.friend_overview() from public;
revoke all on function public.friend_request_count() from public;
revoke all on function public.respond_friend_request(uuid, boolean) from public;
revoke all on function public.cancel_friend_request(uuid) from public;
revoke all on function public.remove_friend(uuid) from public;
revoke all on function public.get_friend_invite_link(boolean) from public;
revoke all on function public.get_friend_invite(text) from public;
revoke all on function public.accept_friend_invite(text) from public;
revoke all on function public.get_friend(uuid) from public;
revoke all on function public.friend_training_days(uuid, date, date) from public;
revoke all on function public.friend_training_day(uuid, date) from public;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.friend_overview() to authenticated;
grant execute on function public.friend_request_count() to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.get_friend_invite_link(boolean) to authenticated;
grant execute on function public.get_friend_invite(text) to anon, authenticated;
grant execute on function public.accept_friend_invite(text) to authenticated;
grant execute on function public.get_friend(uuid) to authenticated;
grant execute on function public.friend_training_days(uuid, date, date) to authenticated;
grant execute on function public.friend_training_day(uuid, date) to authenticated;

commit;

notify pgrst, 'reload schema';


-- Weryfikacja: jeden wiersz, tables = 3, functions = 16.
select
  (select count(*) from pg_tables
   where schemaname = 'public'
     and tablename in ('friendships', 'friend_requests', 'friend_invite_links')) as tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('display_name', 'my_email', 'are_friends', 'make_friends',
                       'send_friend_request', 'friend_overview', 'friend_request_count',
                       'respond_friend_request', 'cancel_friend_request', 'remove_friend',
                       'get_friend_invite_link', 'get_friend_invite', 'accept_friend_invite',
                       'get_friend', 'friend_training_days', 'friend_training_day')) as functions;
