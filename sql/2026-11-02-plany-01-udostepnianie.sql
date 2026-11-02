-- rawlogger — udostępnianie planów linkiem, import i katalog publiczny
-- 2026-11-02
--
-- URUCHOM PRZED wdrożeniem kodu z feat/plan-sharing. Same dodatki: stary
-- kod nie zna nowych kolumn i funkcji, więc działa dalej bez zmian.
--
-- Model:
--   * każdy plan ma stały share_token; link /p/<token> działa, gdy
--     link_shared lub is_public. Wyłączenie linku zmienia token w kodzie.
--   * link i katalog to osobne przełączniki; oba pokazują plan na żywo.
--   * udostępniane są tylko ćwiczenia z notatkami, bez notatki do planu.
--   * ranking = plusy + 2 × importy. Jedna osoba to jeden plus i jeden
--     import na plan. Nie da się dać plusa sobie, a import własnego planu
--     tworzy kopię, ale się nie liczy.
--
-- Plusy i importy zapisują wyłącznie funkcje SECURITY DEFINER, bo
-- wymagają odczytu cudzego planu. Tabele nie mają polityk INSERT, więc
-- bezpośredni zapis z klienta odbija się o RLS. Każde zapytanie w
-- funkcjach jest scopowane ręcznie: po tokenie albo po v_uid.
--
-- Bezpieczne do powtórzenia, całość w jednej transakcji.

begin;

-- 1. Notatka przy ćwiczeniu w planie
alter table public.plan_exercises add column if not exists note text;
alter table public.plan_exercises drop constraint if exists plan_exercises_note_len;
alter table public.plan_exercises
  add constraint plan_exercises_note_len check (char_length(note) <= 140);


-- 2. Udostępnianie planu. Domyślna wartość jest liczona osobno dla
--    każdego istniejącego wiersza, więc tokeny są od razu unikalne.
alter table public.training_plans
  add column if not exists share_token text not null
  default replace(gen_random_uuid()::text, '-', '');
alter table public.training_plans add column if not exists link_shared boolean not null default false;
alter table public.training_plans add column if not exists is_public boolean not null default false;
alter table public.training_plans add column if not exists published_at timestamptz;

alter table public.training_plans drop constraint if exists training_plans_share_token_key;
alter table public.training_plans
  add constraint training_plans_share_token_key unique (share_token);
alter table public.training_plans drop constraint if exists training_plans_share_token_len;
alter table public.training_plans
  add constraint training_plans_share_token_len check (char_length(share_token) >= 24);

create index if not exists training_plans_public_idx
  on public.training_plans (published_at desc) where is_public;


-- 3. Plusy i importy
create table if not exists public.plan_votes (
  plan_id    uuid not null references public.training_plans (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

create table if not exists public.plan_imports (
  plan_id    uuid not null references public.training_plans (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

create index if not exists plan_votes_user_idx   on public.plan_votes (user_id);
create index if not exists plan_imports_user_idx on public.plan_imports (user_id);

alter table public.plan_votes   enable row level security;
alter table public.plan_imports enable row level security;

-- Własne wpisy można zobaczyć i usunąć (usuwanie konta). Zapis tylko przez funkcje.
drop policy if exists own_select on public.plan_votes;
drop policy if exists own_delete on public.plan_votes;
create policy own_select on public.plan_votes for select using (auth.uid() = user_id);
create policy own_delete on public.plan_votes for delete using (auth.uid() = user_id);

drop policy if exists own_select on public.plan_imports;
drop policy if exists own_delete on public.plan_imports;
create policy own_select on public.plan_imports for select using (auth.uid() = user_id);
create policy own_delete on public.plan_imports for delete using (auth.uid() = user_id);

revoke all on public.plan_votes, public.plan_imports from anon;


-- 4. Podgląd planu po tokenie. Działa też bez logowania (link).
--    Zwraca NULL, gdy token nie istnieje albo plan nie jest udostępniony.
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
    'author',    (select nullif(btrim(up.nickname), '') from public.user_profiles up
                  where up.id = v_plan.user_id),
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

revoke all on function public.get_shared_plan(text) from public;
grant execute on function public.get_shared_plan(text) to anon, authenticated;


-- 5. Katalog: plany publiczne z co najmniej jednym ćwiczeniem, wg rankingu.
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
    nullif(btrim(up.nickname), ''),
    ex.c,
    v.c,
    i.c,
    v.c + 2 * i.c,
    exists (select 1 from public.plan_votes pv
            where pv.plan_id = tp.id and pv.user_id = auth.uid()),
    tp.user_id = auth.uid(),
    tp.published_at
  from public.training_plans tp
  left join public.user_profiles up on up.id = tp.user_id
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

revoke all on function public.plan_catalog(text) from public;
grant execute on function public.plan_catalog(text) to authenticated;


-- 6. Plus: przełącza głos. Zwraca {"ok": true, "my_vote": bool, "votes": n}
--    albo {"ok": false, "reason": "not_found" | "own"}.
create or replace function public.toggle_plan_vote(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan_id uuid;
  v_owner uuid;
  v_on boolean;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  select tp.id, tp.user_id into v_plan_id, v_owner
  from public.training_plans tp
  where tp.share_token = p_token and (tp.link_shared or tp.is_public);

  if v_plan_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_owner = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'own');
  end if;

  delete from public.plan_votes pv where pv.plan_id = v_plan_id and pv.user_id = v_uid;
  v_on := not found;

  if v_on then
    insert into public.plan_votes (plan_id, user_id) values (v_plan_id, v_uid);
  end if;

  return jsonb_build_object(
    'ok', true, 'my_vote', v_on,
    'votes', (select count(*) from public.plan_votes pv where pv.plan_id = v_plan_id)
  );
end $$;

revoke all on function public.toggle_plan_vote(text) from public;
grant execute on function public.toggle_plan_vote(text) to authenticated;


-- 7. Import: kopia planu u importującego. Brakujące ćwiczenia trafiają do
--    jego katalogu, zarchiwizowane wracają (jak ensure_exercise).
--    Zwraca {"ok": true, "plan_id": uuid} albo {"ok": false, "reason": "not_found"}.
create or replace function public.import_plan(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_src  public.training_plans;
  v_new  uuid;
  v_ex   uuid;
  v_pos  int := 0;
  r      record;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  select * into v_src
  from public.training_plans tp
  where tp.share_token = p_token and (tp.link_shared or tp.is_public);

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.training_plans (user_id, title, content)
  values (v_uid, v_src.title, '')
  returning id into v_new;

  for r in
    select e.name, pe.note
    from public.plan_exercises pe
    join public.exercises e on e.id = pe.exercise_id
    where pe.plan_id = v_src.id
    order by pe.position, pe.id
  loop
    insert into public.exercises as e (user_id, name)
    values (v_uid, r.name)
    on conflict (user_id, lower(name)) do update set archived_at = null
    returning e.id into v_ex;

    insert into public.plan_exercises (plan_id, user_id, exercise_id, position, note)
    values (v_new, v_uid, v_ex, v_pos, r.note);
    v_pos := v_pos + 1;
  end loop;

  if v_src.user_id <> v_uid then
    insert into public.plan_imports (plan_id, user_id)
    values (v_src.id, v_uid)
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'plan_id', v_new);
end $$;

revoke all on function public.import_plan(text) from public;
grant execute on function public.import_plan(text) to authenticated;

commit;

notify pgrst, 'reload schema';


-- Weryfikacja: jeden wiersz, plans_without_token = 0, functions = 4, tables = 2.
select
  (select count(*) from public.training_plans where share_token is null) as plans_without_token,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('get_shared_plan', 'plan_catalog', 'toggle_plan_vote', 'import_plan')) as functions,
  (select count(*) from pg_tables
   where schemaname = 'public' and tablename in ('plan_votes', 'plan_imports')) as tables;
