-- rawlogger — normalizacja wielkości liter w nazwach ćwiczeń
-- 2026-10-25
--
-- POWÓD
-- Sekcja 3 pliku 2026-10-25-rename-merge-exercise.sql nie może utworzyć
-- indeksu exercises_user_lower_name_key, bo w katalogu są wpisy różniące się
-- tylko wielkością liter (np. "Drążek" i "drążek"). Constraint
-- exercises_user_id_name_key UNIQUE (user_id, name) jest wrażliwy na
-- wielkość liter, więc je przepuścił — a aplikacja czyta nazwy przez ilike
-- i traktuje oba warianty jako jedno ćwiczenie.
--
-- Tego przypadku NIE da się naprawić z UI: rename_exercise dopasowuje nazwę
-- przez lower(...), więc UPDATE katalogu trafia w oba warianty jednocześnie
-- i znów narusza unikalność. Stąd ten jednorazowy skrypt.
--
-- Skrypt wybiera wariant kanoniczny automatycznie — to czysta zmiana
-- pisowni, nie wymaga decyzji per przypadek jak inwentarz sierot.
-- Kryterium: najwięcej serii zapisanych dokładnie tą pisownią, przy
-- remisie najstarszy wpis w katalogu.
--
-- Działa dla WSZYSTKICH kont, bo indeks jest na całej tabeli i blokuje go
-- duplikat u dowolnego użytkownika.
--
-- KROK 1 i 2 to SELECT-y. KROK 3 zmienia dane, w transakcji. KROK 4 zakłada
-- indeksy, które zamykają problem na przyszłość.
--
-- WYKONANE 2026-10-25. W praktyce jedyną grupą duplikatów w katalogu była
-- para "drĄżek" / "Drążek" (rozwiązana osobnym skryptem
-- 2026-10-25-merge-drazek-to-podciaganie.sql), a w ulubionych "BpH+" /
-- "Bph+". Po ich uprzątnięciu KROK 3 przepisał 83 serie i 3 wpisy w planach
-- na pisownię z katalogu, a KROK 4 założył oba indeksy.
--
-- Motyw funkcjonalny dla KROKU 3a: część kodu dopasowuje nazwę dokładnie,
-- nie przez ilike — grouped[s.exercise_name] w widoku dnia i .eq() w
-- moveGroup. Dwie pisownie w jednym dniu dają dwie osobne karty tego
-- samego ćwiczenia i rozjeżdżają display_order przy przestawianiu.


-- ============================================================
-- KROK 1. SELECT — które grupy są zduplikowane i co wybierze skrypt
-- ============================================================
-- rn = 1 to wariant, który zostanie zachowany. Pozostałe zostaną scalone
-- w niego i usunięte z katalogu. Przejrzyj, czy wybór Ci odpowiada.

with grp as (
  select user_id, lower(name) as lname
  from public.exercises
  group by user_id, lower(name)
  having count(*) > 1
),
variants as (
  select
    e.id, e.user_id, e.name, e.created_at, lower(e.name) as lname,
    (select count(*) from public.training_sets ts
      where ts.user_id = e.user_id and ts.exercise_name = e.name) as serie_ta_pisownia
  from public.exercises e
  join grp g on g.user_id = e.user_id and g.lname = lower(e.name)
)
select
  user_id, lname, name, serie_ta_pisownia, created_at,
  row_number() over (
    partition by user_id, lname
    order by serie_ta_pisownia desc, created_at asc, id asc
  ) as rn
from variants
order by user_id, lname, rn;


-- ============================================================
-- KROK 2. SELECT — ile wierszy ruszy normalizacja
-- ============================================================

with canon as (
  select distinct on (e.user_id, lower(e.name))
         e.user_id, e.name, lower(e.name) as lname
  from public.exercises e
  order by e.user_id, lower(e.name),
           (select count(*) from public.training_sets ts
             where ts.user_id = e.user_id and ts.exercise_name = e.name) desc,
           e.created_at, e.id
)
select 'serie do przepisania' as co, count(*) as wiersze
from public.training_sets ts
join canon c on c.user_id = ts.user_id and c.lname = lower(ts.exercise_name)
where ts.exercise_name <> c.name

union all

select 'ulubione do przepisania', count(*)
from public.favorite_exercises f
join canon c on c.user_id = f.user_id and c.lname = lower(f.exercise_name)
where f.exercise_name <> c.name

union all

select 'ulubione zduplikowane (do usuniecia)', count(*) - count(distinct (user_id, lower(exercise_name)))
from public.favorite_exercises

union all

select 'wpisy w planach do przepisania', count(*)
from public.plan_exercises pe
join public.training_plans tp on tp.id = pe.plan_id
join canon c on c.user_id = tp.user_id and c.lname = lower(pe.exercise_name)
where pe.exercise_name <> c.name

union all

select 'wpisy katalogu do usuniecia', count(*)
from public.exercises e
join canon c on c.user_id = e.user_id and c.lname = lower(e.name)
where e.name <> c.name;


-- ============================================================
-- KROK 3. UPDATE — normalizacja, w transakcji
-- ============================================================
-- Kolejność ma znaczenie: najpierw historia i ulubione (póki wszystkie
-- warianty jeszcze są w katalogu), na końcu usunięcie wpisów katalogowych.

begin;

-- 3a. Historia serii na pisownię kanoniczną.
with canon as (
  select distinct on (e.user_id, lower(e.name))
         e.user_id, e.name, lower(e.name) as lname
  from public.exercises e
  order by e.user_id, lower(e.name),
           (select count(*) from public.training_sets ts
             where ts.user_id = e.user_id and ts.exercise_name = e.name) desc,
           e.created_at, e.id
)
update public.training_sets ts
set exercise_name = c.name
from canon c
where c.user_id = ts.user_id
  and c.lname = lower(ts.exercise_name)
  and ts.exercise_name <> c.name;

-- 3b. Ulubione: najpierw usuń duplikaty w obrębie tej samej nazwy bez
--     wielkości liter (zostaje najstarszy), bo favorite_exercises ma
--     UNIQUE (user_id, exercise_name) wrażliwy na wielkość liter —
--     bez tego krok 3c naruszyłby go. W bazie są np. "BpH+" i "Bph+".
with ranked as (
  select id, row_number() over (
           partition by user_id, lower(exercise_name)
           order by created_at, id
         ) as rn
  from public.favorite_exercises
)
delete from public.favorite_exercises f
using ranked r
where f.id = r.id and r.rn > 1;

-- 3c. Ocalałe ulubione na pisownię kanoniczną.
with canon as (
  select distinct on (e.user_id, lower(e.name))
         e.user_id, e.name, lower(e.name) as lname
  from public.exercises e
  order by e.user_id, lower(e.name),
           (select count(*) from public.training_sets ts
             where ts.user_id = e.user_id and ts.exercise_name = e.name) desc,
           e.created_at, e.id
)
update public.favorite_exercises f
set exercise_name = c.name
from canon c
where c.user_id = f.user_id
  and c.lname = lower(f.exercise_name)
  and f.exercise_name <> c.name;

-- 3d. Plany na pisownię kanoniczną, potem usunięcie duplikatu w obrębie
--     jednego planu (zostaje wpis o najmniejszej position).
with canon as (
  select distinct on (e.user_id, lower(e.name))
         e.user_id, e.name, lower(e.name) as lname
  from public.exercises e
  order by e.user_id, lower(e.name),
           (select count(*) from public.training_sets ts
             where ts.user_id = e.user_id and ts.exercise_name = e.name) desc,
           e.created_at, e.id
)
update public.plan_exercises pe
set exercise_name = c.name
from public.training_plans tp, canon c
where tp.id = pe.plan_id
  and c.user_id = tp.user_id
  and c.lname = lower(pe.exercise_name)
  and pe.exercise_name <> c.name;

with ranked as (
  select pe.id, row_number() over (
           partition by pe.plan_id, pe.exercise_name
           order by pe.position, pe.id
         ) as rn
  from public.plan_exercises pe
)
delete from public.plan_exercises pe
using ranked r
where pe.id = r.id and r.rn > 1;

-- 3e. Katalog: usuń warianty niekanoniczne.
with canon as (
  select distinct on (e.user_id, lower(e.name))
         e.user_id, e.name, lower(e.name) as lname
  from public.exercises e
  order by e.user_id, lower(e.name),
           (select count(*) from public.training_sets ts
             where ts.user_id = e.user_id and ts.exercise_name = e.name) desc,
           e.created_at, e.id
)
delete from public.exercises e
using canon c
where c.user_id = e.user_id
  and c.lname = lower(e.name)
  and e.name <> c.name;

commit;


-- ============================================================
-- KROK 4. Indeksy — domknięcie problemu
-- ============================================================
-- Po normalizacji oba powinny się założyć bez błędu. Jeśli któryś nadal
-- pada na 23505, uruchom KROK 1 jeszcze raz — znaczy, że doszedł nowy
-- duplikat.

create unique index if not exists exercises_user_lower_name_key
  on public.exercises (user_id, lower(name));

-- To samo dla ulubionych: istniejący UNIQUE (user_id, exercise_name) jest
-- wrażliwy na wielkość liter, więc przepuszcza "BpH+" obok "Bph+", a taka
-- para wywraca UPDATE w rename_exercise.
create unique index if not exists favorite_exercises_user_lower_name_key
  on public.favorite_exercises (user_id, lower(exercise_name));


-- ============================================================
-- WERYFIKACJA
-- ============================================================
-- Oba zapytania powinny zwrócić 0 wierszy.

select user_id, lower(name) as lname, count(*)
from public.exercises
group by user_id, lower(name)
having count(*) > 1;

select user_id, lower(exercise_name) as lname, count(*)
from public.favorite_exercises
group by user_id, lower(exercise_name)
having count(*) > 1;
