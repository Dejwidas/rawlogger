-- rawlogger — scalenie "drĄżek" + "Drążek" i zmiana nazwy na "Podciąganie"
-- 2026-10-25
--
-- POWÓD
-- Z UI tego nie da się zrobić: rename_exercise dopasowuje nazwę przez
-- lower(...), więc UPDATE katalogu trafia w oba warianty jednocześnie,
-- próbuje nadać im tę samą nazwę i narusza
-- exercises_user_id_name_key UNIQUE (user_id, name) -> 23505.
--
-- ZAKRES
-- Rusza wyłącznie wiersze, dla których lower(nazwa) = 'drążek'
-- (czyli "Drążek" i "drĄżek") oraz 'podciąganie'. NIE rusza nazw bez
-- ogonków — "drazek", "Drazek zwis", "Drazekk", "drazek zwis" mają inny
-- lower() i są osobnymi ćwiczeniami.
--
-- :UID NIE jest parametrem — Supabase SQL Editor go nie rozwinie. Zrób
-- zamień-wszystko na swoje konto, np. :UID -> 'xxxxxxxx-...'::uuid
-- W bazie jest 7 kont z historią treningową, więc sprawdź, że to Twoje.
--
-- WYKONANE 2026-10-25 na koncie właściciela: 205 serii / 51 sesji
-- przeniesione z "Drążek" na "Podciąganie". "drĄżek" był martwym wpisem
-- katalogowym bez historii.
--
-- Jeśli chcesz nazwę bez ogonka ("Podciaganie"), podmień 'Podciąganie'
-- we wszystkich wystąpieniach poniżej.


-- ============================================================
-- KROK 1. SELECT — stan przed zmianą
-- ============================================================

select 'katalog' as gdzie, name as nazwa, created_at::text as info
from public.exercises
where user_id = :UID
  and lower(name) in ('drążek', 'podciąganie')

union all

select 'historia', exercise_name,
       count(*) || ' serii / ' || count(distinct date) || ' sesji'
from public.training_sets
where user_id = :UID
  and lower(exercise_name) in ('drążek', 'podciąganie')
group by exercise_name

union all

select 'ulubione', exercise_name, created_at::text
from public.favorite_exercises
where user_id = :UID
  and lower(exercise_name) in ('drążek', 'podciąganie')

union all

select 'plan', pe.exercise_name, tp.title
from public.plan_exercises pe
join public.training_plans tp on tp.id = pe.plan_id
where tp.user_id = :UID
  and lower(pe.exercise_name) in ('drążek', 'podciąganie');

-- Spodziewane w historii: "Drążek" 205 serii / 51 sesji,
-- plus ewentualnie "drĄżek" z testów.


-- ============================================================
-- KROK 2. UPDATE — scalenie i zmiana nazwy, w transakcji
-- ============================================================

begin;

-- 2a. Historia serii — właściwe scalenie.
update public.training_sets
set exercise_name = 'Podciąganie'
where user_id = :UID
  and lower(exercise_name) in ('drążek', 'podciąganie')
  and exercise_name <> 'Podciąganie';

-- 2b. Jeden display_order na dzień. Potrzebne, jeśli oba warianty
--     wystąpiły w tym samym dniu jako osobne grupy.
update public.training_sets ts
set display_order = f.mo
from (
  select date, min(display_order) as mo
  from public.training_sets
  where user_id = :UID
    and exercise_name = 'Podciąganie'
  group by date
) f
where ts.user_id = :UID
  and ts.exercise_name = 'Podciąganie'
  and ts.date = f.date
  and ts.display_order <> f.mo;

-- 2c. Ulubione: zostaw najwyżej jeden wpis z całej scalanej grupy,
--     dopiero potem zmień mu nazwę. Partycjonowanie po user_id, nie po
--     lower(nazwa) — inaczej przeżyłyby dwa wpisy i UPDATE poniżej
--     naruszyłby UNIQUE (user_id, exercise_name).
with ranked as (
  select id, row_number() over (partition by user_id order by created_at, id) as rn
  from public.favorite_exercises
  where user_id = :UID
    and lower(exercise_name) in ('drążek', 'podciąganie')
)
delete from public.favorite_exercises f
using ranked r
where f.id = r.id and r.rn > 1;

update public.favorite_exercises
set exercise_name = 'Podciąganie'
where user_id = :UID
  and lower(exercise_name) in ('drążek', 'podciąganie')
  and exercise_name <> 'Podciąganie';

-- 2d. Plany: zmiana nazwy, potem usunięcie duplikatu w obrębie jednego
--     planu (zostaje wpis o najmniejszej position).
update public.plan_exercises pe
set exercise_name = 'Podciąganie'
where lower(pe.exercise_name) in ('drążek', 'podciąganie')
  and pe.exercise_name <> 'Podciąganie'
  and pe.plan_id in (
    select id from public.training_plans
    where user_id = :UID
  );

with ranked as (
  select pe.id,
         row_number() over (partition by pe.plan_id order by pe.position, pe.id) as rn
  from public.plan_exercises pe
  join public.training_plans tp on tp.id = pe.plan_id
  where tp.user_id = :UID
    and pe.exercise_name = 'Podciąganie'
)
delete from public.plan_exercises pe
using ranked r
where pe.id = r.id and r.rn > 1;

-- 2e. Katalog: usuń wszystkie warianty grupy i wstaw jeden wpis.
--     Proste delete + insert, bo na exercises.id nie wisi żaden FK.
delete from public.exercises
where user_id = :UID
  and lower(name) in ('drążek', 'podciąganie');

insert into public.exercises (user_id, name)
values (:UID, 'Podciąganie');

commit;


-- ============================================================
-- WERYFIKACJA
-- ============================================================
-- Spodziewane: co najmniej 205 serii / 51 sesji pod "Podciąganie"
-- i 0 wierszy pod starymi wariantami.

select exercise_name, count(*) as serie, count(distinct date) as sesje
from public.training_sets
where user_id = :UID
  and lower(exercise_name) in ('drążek', 'podciąganie')
group by exercise_name;

select name from public.exercises
where user_id = :UID
  and lower(name) in ('drążek', 'podciąganie');
