-- rawlogger — atomowa zmiana nazwy ćwiczenia + scalanie
-- 2026-10-25
--
-- Nazwa ćwiczenia jest w tej bazie zdenormalizowana: leży tekstem w
-- training_sets.exercise_name, favorite_exercises.exercise_name oraz
-- plan_exercises.exercise_name. Nie ma exercise_id. Zmiana nazwy musi więc
-- przepisać wszystkie trzy tabele, a to ma sens tylko jako jedna transakcja —
-- stąd RPC zamiast kilku UPDATE-ów z klienta.
--
-- Obie funkcje są SECURITY DEFINER, bo plan_exercises nie ma user_id i jego
-- RLS zależy od joina do training_plans. Każde zapytanie w środku jest
-- scopowane po auth.uid() ręcznie — bez tego funkcja widziałaby dane
-- wszystkich użytkowników. Dlatego: nie dodawaj tu żadnego statementu bez
-- warunku na v_uid.
--
-- Dopasowanie nazwy jest bez wielkości liter (lower(...) = lower(...)),
-- żeby złapać stare wiersze zapisane inną wielkością liter — reszta
-- aplikacji czyta przez ilike, więc to jest spójne z tym, co widzisz w UI.
--
-- Sekcja 0 to tylko SELECT-y. Sekcja 3 (unikalny indeks) wymaga, by nie
-- było duplikatów — patrz 0b.


-- ============================================================
-- 0. DIAGNOSTYKA (tylko odczyt)
-- ============================================================

-- 0a. Jakie polityki RLS mają tabele, które funkcje będą ruszać?
--     Informacyjnie — SECURITY DEFINER je omija, scopowanie jest ręczne.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('exercises', 'training_sets', 'favorite_exercises', 'plan_exercises')
order by tablename, cmd;

-- 0b. Czy masz już ćwiczenia różniące się tylko wielkością liter?
--     Jeśli coś zwróci — scal je w aplikacji PRZED sekcją 3, bo inaczej
--     tworzenie unikalnego indeksu padnie.
select user_id, lower(name) as nazwa, count(*) as ile, array_agg(name) as warianty
from public.exercises
group by user_id, lower(name)
having count(*) > 1
order by ile desc;

-- 0c. Ćwiczenia-widma: nazwy obecne w historii, ale nieobecne w słowniku.
--     Najczęstsza przyczyna to właśnie stara, niepełna zmiana nazwy, która
--     nie ruszyła plan_exercises.
select ts.exercise_name, count(*) as serie, min(ts.date) as od, max(ts.date) as do
from public.training_sets ts
where not exists (
  select 1 from public.exercises e
  where e.user_id = ts.user_id and lower(e.name) = lower(ts.exercise_name)
)
group by ts.exercise_name
order by serie desc;


-- ============================================================
-- 1. RPC: rename_exercise
-- ============================================================
-- Zwraca jsonb, nie rzuca wyjątkiem na przypadki, które UI ma obsłużyć:
--   {"ok": true,  "sets": n, "favorites": n, "plans": n, "name": "..."}
--   {"ok": false, "reason": "empty"}       — pusta nazwa po przycięciu
--   {"ok": false, "reason": "too_long"}
--   {"ok": false, "reason": "not_found"}   — nie ma czego zmieniać
--   {"ok": false, "reason": "duplicate", "target": "...", "target_sets": n}
--     ^ nazwa zajęta; UI proponuje scalenie i woła merge_exercise

create or replace function public.rename_exercise(p_old text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_old   text := btrim(p_old);
  v_new   text := btrim(p_new);
  v_target text;
  v_sets  int;
  v_favs  int;
  v_plans int;
  v_dict  int;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  if v_new = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  if length(v_new) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;

  -- Sama zmiana wielkości liter tej samej nazwy to NIE duplikat —
  -- ten warunek musi być przed sprawdzeniem kolizji.
  if lower(v_new) <> lower(v_old) then
    select e.name into v_target
    from public.exercises e
    where e.user_id = v_uid and lower(e.name) = lower(v_new)
    limit 1;

    if v_target is not null then
      return jsonb_build_object(
        'ok', false,
        'reason', 'duplicate',
        'target', v_target,
        'target_sets', (
          select count(*) from public.training_sets ts
          where ts.user_id = v_uid and lower(ts.exercise_name) = lower(v_target)
        )
      );
    end if;
  end if;

  -- słownik
  update public.exercises e
  set name = v_new
  where e.user_id = v_uid and lower(e.name) = lower(v_old);
  get diagnostics v_dict = row_count;

  -- historia serii
  update public.training_sets ts
  set exercise_name = v_new
  where ts.user_id = v_uid and lower(ts.exercise_name) = lower(v_old);
  get diagnostics v_sets = row_count;

  -- ulubione
  -- favorite_exercises ma UNIQUE (user_id, exercise_name), więc gdyby w
  -- ulubionych istniał już wpis na nową nazwę bez odpowiednika w słowniku
  -- (gwiazdka po ćwiczeniu-widmie), UPDATE poniżej wywaliłby 23505 i cofnął
  -- całą transakcję. Sprzątamy taki osierocony wpis najpierw.
  delete from public.favorite_exercises f
  where f.user_id = v_uid
    and lower(f.exercise_name) = lower(v_new)
    and lower(f.exercise_name) <> lower(v_old);

  update public.favorite_exercises f
  set exercise_name = v_new
  where f.user_id = v_uid and lower(f.exercise_name) = lower(v_old);
  get diagnostics v_favs = row_count;

  -- plany: brak user_id, właściciel przez plan_id
  update public.plan_exercises pe
  set exercise_name = v_new
  where lower(pe.exercise_name) = lower(v_old)
    and pe.plan_id in (select tp.id from public.training_plans tp where tp.user_id = v_uid);
  get diagnostics v_plans = row_count;

  if v_dict = 0 and v_sets = 0 and v_favs = 0 and v_plans = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true, 'name', v_new,
    'sets', v_sets, 'favorites', v_favs, 'plans', v_plans
  );
end $$;

revoke all on function public.rename_exercise(text, text) from public, anon;
grant execute on function public.rename_exercise(text, text) to authenticated;


-- ============================================================
-- 2. RPC: merge_exercise
-- ============================================================
-- Scalenie "from" w "into". Przy nazwie trzymanej tekstem jest to ten sam
-- UPDATE co zmiana nazwy plus trzy sprzątnięcia kolizji:
--   * training_sets — po scaleniu jedno ćwiczenie może mieć w jednym dniu
--     dwa różne display_order (bo A i B były osobnymi grupami); zrównujemy
--     je do najmniejszego, żeby grupa nie rozjechała się na liście
--   * favorite_exercises — gwiazdka zostaje, jeśli miało ją którekolwiek
--   * plan_exercises — to samo ćwiczenie dwa razy w jednym planie:
--     zostaje wpis o najmniejszej position
--
-- Zwraca: {"ok": true, "into": "...", "sets": n, "plans_removed": n}
--         {"ok": false, "reason": "same"|"not_found"|"target_not_found"}

create or replace function public.merge_exercise(p_from text, p_into text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_from text := btrim(p_from);
  v_into text := btrim(p_into);
  v_canon text;
  v_sets int;
  v_plans_removed int;
  v_had_fav boolean;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  if v_from = '' or v_into = '' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if lower(v_from) = lower(v_into) then
    return jsonb_build_object('ok', false, 'reason', 'same');
  end if;

  -- nazwa docelowa w zapisie ze słownika, żeby nie wprowadzać trzeciego
  -- wariantu wielkości liter
  select e.name into v_canon
  from public.exercises e
  where e.user_id = v_uid and lower(e.name) = lower(v_into)
  limit 1;

  if v_canon is null then
    return jsonb_build_object('ok', false, 'reason', 'target_not_found');
  end if;

  if not exists (
    select 1 from public.exercises e
    where e.user_id = v_uid and lower(e.name) = lower(v_from)
  ) and not exists (
    select 1 from public.training_sets ts
    where ts.user_id = v_uid and lower(ts.exercise_name) = lower(v_from)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- 1. historia serii
  update public.training_sets ts
  set exercise_name = v_canon
  where ts.user_id = v_uid and lower(ts.exercise_name) = lower(v_from);
  get diagnostics v_sets = row_count;

  -- 2. jeden display_order na dzień dla scalonej grupy
  update public.training_sets ts
  set display_order = f.mo
  from (
    select ts2.date, min(ts2.display_order) as mo
    from public.training_sets ts2
    where ts2.user_id = v_uid and ts2.exercise_name = v_canon
    group by ts2.date
  ) f
  where ts.user_id = v_uid
    and ts.exercise_name = v_canon
    and ts.date = f.date
    and ts.display_order <> f.mo;

  -- 3. ulubione — gwiazdka przechodzi, jeśli miało ją którekolwiek z dwóch
  select exists (
    select 1 from public.favorite_exercises f
    where f.user_id = v_uid
      and (lower(f.exercise_name) = lower(v_from) or lower(f.exercise_name) = lower(v_canon))
  ) into v_had_fav;

  delete from public.favorite_exercises f
  where f.user_id = v_uid and lower(f.exercise_name) = lower(v_from);

  if v_had_fav and not exists (
    select 1 from public.favorite_exercises f
    where f.user_id = v_uid and lower(f.exercise_name) = lower(v_canon)
  ) then
    insert into public.favorite_exercises (user_id, exercise_name)
    values (v_uid, v_canon);
  end if;

  -- 4. plany
  update public.plan_exercises pe
  set exercise_name = v_canon
  where lower(pe.exercise_name) = lower(v_from)
    and pe.plan_id in (select tp.id from public.training_plans tp where tp.user_id = v_uid);

  with ranked as (
    select pe.id,
           row_number() over (partition by pe.plan_id order by pe.position, pe.id) as rn
    from public.plan_exercises pe
    join public.training_plans tp on tp.id = pe.plan_id
    where tp.user_id = v_uid and pe.exercise_name = v_canon
  )
  delete from public.plan_exercises pe
  using ranked r
  where pe.id = r.id and r.rn > 1;
  get diagnostics v_plans_removed = row_count;

  -- 5. słownik: źródło przestaje istnieć
  delete from public.exercises e
  where e.user_id = v_uid and lower(e.name) = lower(v_from);

  return jsonb_build_object(
    'ok', true, 'into', v_canon,
    'sets', v_sets, 'plans_removed', v_plans_removed
  );
end $$;

revoke all on function public.merge_exercise(text, text) from public, anon;
grant execute on function public.merge_exercise(text, text) to authenticated;


-- ============================================================
-- 3. Unikalność nazw w słowniku (opcjonalne, polecane)
-- ============================================================
-- W bazie jest już constraint exercises_user_id_name_key UNIQUE (user_id,
-- name), ale jest WRAŻLIWY na wielkość liter — przepuszcza "Przysiad"
-- i "przysiad" jako dwa osobne ćwiczenia, choć cała aplikacja czyta je
-- przez ilike i traktuje jako jedno. Ten indeks domyka tę szczelinę
-- i jest uzupełnieniem istniejącego constraintu, nie jego duplikatem.
--
-- URUCHOM DOPIERO gdy 0b nie zwraca nic.

create unique index if not exists exercises_user_lower_name_key
  on public.exercises (user_id, lower(name));


-- ============================================================
-- 4. Sprzątanie po migracji z notatkami (opcjonalne)
-- ============================================================
-- Backup pokazał, że training_notes miało już constraint
-- training_notes_user_id_date_key UNIQUE (user_id, date) oraz politykę
-- "own" typu FOR ALL. Indeks i cztery polityki dodane poprzednią migracją
-- są więc nadmiarowe: indeks to drugi, identyczny unique na tej samej
-- parze kolumn (koszt przy każdym zapisie notatki), a polityki są OR-owane
-- z "own", która i tak przepuszcza wszystkie operacje.
--
-- Nic się nie zepsuje, jeśli to zostawisz. Poniższe tylko porządkuje.

drop index if exists public.training_notes_user_date_key;

drop policy if exists training_notes_select_own on public.training_notes;
drop policy if exists training_notes_insert_own on public.training_notes;
drop policy if exists training_notes_update_own on public.training_notes;
drop policy if exists training_notes_delete_own on public.training_notes;

-- Kontrola: powinien zostać sam constraint + polityka "own".
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'training_notes';

select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'training_notes';
