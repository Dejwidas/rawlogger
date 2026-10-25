-- rawlogger — jednorazowa naprawa osieroconej historii ćwiczeń
-- 2026-10-25
--
-- KONTEKST
-- Nazwa ćwiczenia jest w tej bazie trzymana tekstem w training_sets,
-- favorite_exercises i plan_exercises. Stara wersja zmiany nazwy robiła trzy
-- niezależne UPDATE-y bez obsługi błędów. Przy próbie zmiany "Bp" na nazwę,
-- która już istniała w katalogu ("Bench press", utworzone 2026-05-10),
-- UPDATE katalogu naruszył exercises_user_id_name_key UNIQUE (user_id, name)
-- i zwrócił 23505 — po cichu. Potem wpis "Bp" został usunięty z katalogu
-- (deleteExercise nie rusza historii), więc 131 serii w 30 sesjach zostało
-- bez odpowiednika w katalogu.
--
-- Skutek w UI: "Najpopularniejsze" i licznik sesji pomijają wiersze bez
-- wpisu w katalogu, więc "Bench press" pokazuje 1 sesję. Wyszukiwarka
-- odpytuje training_sets wprost przez ilike, więc po "bp" nadal widać 30.
--
-- UWAGA: w bazie jest 7 różnych user_id z historią treningową. Każde
-- zapytanie poniżej jest scopowane na jedno konto — nie ruszaj cudzych
-- danych.
--
-- :UID NIE jest parametrem — Supabase SQL Editor go nie rozwinie. Zrób
-- zwykłe zamień-wszystko w edytorze na swoje konto, np.
-- :UID  ->  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid
-- Swój user_id znajdziesz w Dashboard -> Authentication -> Users.
--
-- KROK 1 i 2 to tylko SELECT-y. KROK 3 zmienia dane i jest w transakcji.


-- ============================================================
-- KROK 1. SELECT — inwentarz: historia bez wpisu w katalogu
-- ============================================================
-- Pokazuje każdą nazwę z historii, która nie ma odpowiednika w katalogu
-- (porównanie bez wielkości liter — tak jak czyta aplikacja).
--
-- Stan na 2026-10-25: 181 wierszy w 22 nazwach w całej bazie, z czego na
-- koncie właściciela 179 wierszy w 20 nazwach — a 131 z nich to opisany
-- powyżej przypadek "Bp", już scalony. Reszta to w większości śmieci
-- z testów oraz pojedyncze serie po ćwiczeniach świadomie usuniętych
-- z katalogu (usunięcie wpisu z katalogu celowo zostawia historię).
--
-- Naprawiaj tylko te pozycje, które rozpoznajesz jako skutek nieudanej
-- zmiany nazwy — czyli takie, dla których istnieje dziś inna nazwa
-- oznaczająca to samo ćwiczenie.

select
  ts.exercise_name                as nazwa_w_historii,
  count(*)                        as serie,
  count(distinct ts.date)         as sesje,
  min(ts.date)                    as pierwsza,
  max(ts.date)                    as ostatnia
from public.training_sets ts
where ts.user_id = :UID
  and not exists (
    select 1 from public.exercises e
    where e.user_id = ts.user_id
      and lower(e.name) = lower(ts.exercise_name)
  )
group by ts.exercise_name
order by serie desc;


-- ============================================================
-- KROK 2. SELECT — ile dokładnie ruszy naprawa jednej pary
-- ============================================================
-- Podstaw nazwę źródłową i docelową. Uruchom PRZED krokiem 3
-- i porównaj liczby z tym, co widzisz w aplikacji.
-- Dla pary Bp -> Bench press spodziewany wynik: 131 serii / 30 sesji
-- do przepisania i 3 serie / 1 sesja już pod nazwą docelową.

select 'do przepisania' as co,
       count(*)                as serie,
       count(distinct date)    as sesje
from public.training_sets
where user_id = :UID and lower(exercise_name) = lower('Bp')

union all

select 'juz pod nazwa docelowa',
       count(*), count(distinct date)
from public.training_sets
where user_id = :UID and lower(exercise_name) = lower('Bench press')

union all

select 'wpisy w planach (zrodlo)',
       count(*), 0
from public.plan_exercises pe
join public.training_plans tp on tp.id = pe.plan_id
where tp.user_id = :UID and lower(pe.exercise_name) = lower('Bp')

union all

select 'ulubione (zrodlo/cel)',
       count(*), 0
from public.favorite_exercises
where user_id = :UID
  and lower(exercise_name) in (lower('Bp'), lower('Bench press'))

union all

select 'katalog (zrodlo/cel)',
       count(*), 0
from public.exercises
where user_id = :UID
  and lower(name) in (lower('Bp'), lower('Bench press'));


-- ============================================================
-- KROK 3. UPDATE — scalenie jednej pary, w transakcji
-- ============================================================
-- Robi to samo, co RPC merge_exercise, ale ze user_id podanym wprost:
-- w SQL Editorze auth.uid() jest NULL, więc RPC by się nie wykonało.
--
-- Zmień 'Bp' / 'Bench press' na swoją parę i :UID na swoje konto.
-- Po BEGIN możesz uruchomić zapytanie weryfikujące z końca pliku,
-- a potem świadomie COMMIT albo ROLLBACK.

begin;

-- 3a. Ulubione: gwiazdka ma zostać, jeśli miało ją którekolwiek z dwóch.
--     Insert PRZED delete, żeby nie zgubić informacji o źródle.
insert into public.exercises (user_id, name)
select :UID, 'Bench press'
where not exists (
  select 1 from public.exercises
  where user_id = :UID and lower(name) = lower('Bench press')
);

insert into public.favorite_exercises (user_id, exercise_name)
select :UID, 'Bench press'
where exists (
    select 1 from public.favorite_exercises
    where user_id = :UID and lower(exercise_name) = lower('Bp')
  )
  and not exists (
    select 1 from public.favorite_exercises
    where user_id = :UID and lower(exercise_name) = lower('Bench press')
  );

delete from public.favorite_exercises
where user_id = :UID and lower(exercise_name) = lower('Bp');

-- 3b. Historia serii — to jest właściwa naprawa.
update public.training_sets
set exercise_name = 'Bench press'
where user_id = :UID and lower(exercise_name) = lower('Bp');

-- 3c. Jeden display_order na dzień dla scalonej grupy. Bez tego dzień,
--     w którym występowały oba ćwiczenia, miałby jedną nazwę w dwóch
--     różnych pozycjach listy.
update public.training_sets ts
set display_order = f.mo
from (
  select date, min(display_order) as mo
  from public.training_sets
  where user_id = :UID and exercise_name = 'Bench press'
  group by date
) f
where ts.user_id = :UID
  and ts.exercise_name = 'Bench press'
  and ts.date = f.date
  and ts.display_order <> f.mo;

-- 3d. Plany: przepisanie nazwy, a potem usunięcie duplikatu w obrębie
--     jednego planu (zostaje wpis o najmniejszej position).
update public.plan_exercises pe
set exercise_name = 'Bench press'
where lower(pe.exercise_name) = lower('Bp')
  and pe.plan_id in (select id from public.training_plans where user_id = :UID);

with ranked as (
  select pe.id,
         row_number() over (partition by pe.plan_id order by pe.position, pe.id) as rn
  from public.plan_exercises pe
  join public.training_plans tp on tp.id = pe.plan_id
  where tp.user_id = :UID and pe.exercise_name = 'Bench press'
)
delete from public.plan_exercises pe
using ranked r
where pe.id = r.id and r.rn > 1;

-- 3e. Katalog: usuń wiersz źródłowy, jeśli jeszcze istnieje.
--     Dla pary Bp -> Bench press to no-op, bo "Bp" zostało już usunięte.
delete from public.exercises
where user_id = :UID and lower(name) = lower('Bp');

commit;


-- ============================================================
-- WERYFIKACJA (po COMMIT albo przed nim, w otwartej transakcji)
-- ============================================================
-- Spodziewany wynik dla Bp -> Bench press: 134 serie / 31 sesji
-- pod nazwą docelową i 0 pod źródłową.

select exercise_name, count(*) as serie, count(distinct date) as sesje
from public.training_sets
where user_id = :UID
  and lower(exercise_name) in (lower('Bp'), lower('Bench press'))
group by exercise_name;


-- ============================================================
-- OSOBNO: śmieciowy wiersz z pustą nazwą
-- ============================================================
-- W historii jest jedna seria z exercise_name = '' (typ timed,
-- data 2026-05-18). Nie da się jej przypisać do żadnego ćwiczenia.
-- Najpierw zobacz, potem zdecyduj.

select id, user_id, date, set_type, timed_seconds, created_at
from public.training_sets
where exercise_name = '' or exercise_name is null;

-- delete from public.training_sets
-- where id = '<id-z-zapytania-powyzej>';
