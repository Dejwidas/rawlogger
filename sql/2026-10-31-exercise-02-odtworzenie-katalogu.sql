-- rawlogger — odtworzenie brakujących wpisów katalogu (etap 1 migracji)
-- 2026-10-31
--
-- URUCHOM DOPIERO PO wdrożeniu kodu z archiwizacją. Na starym kodzie
-- odtworzone wpisy pokazałyby się jako zwykłe ćwiczenia, a jego przycisk
-- "usuń" dalej tworzyłby nowe sieroty.
--
-- Skrypt działa na wszystkich kontach, bo klucz obcy tego wymaga. Niczego nie
-- usuwa. Zasada: nazwa używana w planie wraca jako aktywna, pozostałe jako
-- zarchiwizowane. Jedyna zmieniana seria to wiersz z pustą nazwą.


-- ============================================================
-- KROK 1. SELECT — co zostanie dodane (bez zmian w danych)
-- ============================================================

with used as (
  select ts.user_id, ts.exercise_name as name, false as in_plan
  from public.training_sets ts
  union all
  select f.user_id, f.exercise_name, false
  from public.favorite_exercises f
  union all
  select tp.user_id, pe.exercise_name, true
  from public.plan_exercises pe
  join public.training_plans tp on tp.id = pe.plan_id
)
select left(u.user_id::text, 8) as konto,
       min(u.name)              as nazwa,
       bool_or(u.in_plan)       as aktywne,
       count(*)                 as odwolania
from used u
where btrim(coalesce(u.name, '')) <> ''
  and not exists (
    select 1 from public.exercises e
    where e.user_id = u.user_id and lower(e.name) = lower(u.name)
  )
group by u.user_id, lower(u.name)
order by konto, aktywne desc, odwolania desc;


-- ============================================================
-- KROK 2. Odtworzenie (uruchom cały blok begin ... commit)
-- ============================================================

begin;

-- 2a. brakujące nazwy
with used as (
  select ts.user_id, ts.exercise_name as name, false as in_plan
  from public.training_sets ts
  union all
  select f.user_id, f.exercise_name, false
  from public.favorite_exercises f
  union all
  select tp.user_id, pe.exercise_name, true
  from public.plan_exercises pe
  join public.training_plans tp on tp.id = pe.plan_id
)
insert into public.exercises (user_id, name, archived_at)
select u.user_id,
       min(u.name),
       case when bool_or(u.in_plan) then null else now() end
from used u
where btrim(coalesce(u.name, '')) <> ''
  and not exists (
    select 1 from public.exercises e
    where e.user_id = u.user_id and lower(e.name) = lower(u.name)
  )
group by u.user_id, lower(u.name);

-- 2b. seria bez nazwy dostaje wpis zastępczy, żeby przeszedł późniejszy FK
insert into public.exercises (user_id, name, archived_at)
select distinct ts.user_id, '(bez nazwy)', now()
from public.training_sets ts
where btrim(coalesce(ts.exercise_name, '')) = ''
on conflict do nothing;

update public.training_sets ts
set exercise_name = '(bez nazwy)'
where btrim(coalesce(ts.exercise_name, '')) = '';

-- 2c. jedno ćwiczenie ma w danym dniu mieć jeden display_order
update public.training_sets ts
set display_order = f.mo
from (
  select t.user_id, t.date, lower(t.exercise_name) as lname, min(t.display_order) as mo
  from public.training_sets t
  group by t.user_id, t.date, lower(t.exercise_name)
  having count(distinct t.display_order) > 1
) f
where ts.user_id = f.user_id
  and ts.date = f.date
  and lower(ts.exercise_name) = f.lname
  and ts.display_order <> f.mo;

commit;


-- ============================================================
-- KROK 3. SELECT — weryfikacja, każda liczba ma wynosić 0
-- ============================================================

select 'serie bez katalogu' as co, count(*) as wiersze
from public.training_sets ts
where not exists (select 1 from public.exercises e
                  where e.user_id = ts.user_id and lower(e.name) = lower(ts.exercise_name))
union all
select 'ulubione bez katalogu', count(*)
from public.favorite_exercises f
where not exists (select 1 from public.exercises e
                  where e.user_id = f.user_id and lower(e.name) = lower(f.exercise_name))
union all
select 'plany bez katalogu', count(*)
from public.plan_exercises pe
join public.training_plans tp on tp.id = pe.plan_id
where not exists (select 1 from public.exercises e
                  where e.user_id = tp.user_id and lower(e.name) = lower(pe.exercise_name))
union all
select 'rozne display_order w dniu', count(*)
from (
  select 1 from public.training_sets t
  group by t.user_id, t.date, lower(t.exercise_name)
  having count(distinct t.display_order) > 1
) x;
