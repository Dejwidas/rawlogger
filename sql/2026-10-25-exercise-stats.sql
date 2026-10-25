-- rawlogger — liczenie sesji po stronie serwera
-- 2026-10-25
--
-- POWÓD
-- "Moje ćwiczenia" liczyło sesje w przeglądarce: pobierało CAŁĄ tabelę
-- training_sets (select('exercise_name, date') bez żadnego filtra) i
-- zliczało unikalne daty w JS. Supabase obcina odpowiedź API do wartości
-- "Max rows" (domyślnie 1000), a samo konto właściciela ma 1422 wiersze —
-- więc część danych po cichu nie docierała i ćwiczenia, których serie
-- wpadły w ucięty ogon, pokazywały 0 sesji (np. "Wycisk barki h",
-- które ma 4 serie).
--
-- Agregacja na serwerze zdejmuje zależność od limitu wierszy i zamiast
-- ~1400 wierszy przesyła tyle, ile jest ćwiczeń w katalogu.
--
-- SECURITY INVOKER, bo polityki RLS na exercises i training_sets opierają
-- się o auth.uid() = user_id i same ograniczają widok do własnych danych.
-- Dodatkowy warunek na auth.uid() jest nadmiarowy, ale jawny.

create or replace function public.exercise_stats()
returns table (name text, sessions integer, sets integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.name,
    count(distinct ts.date)::integer as sessions,
    count(ts.id)::integer            as sets
  from public.exercises e
  left join public.training_sets ts
    on ts.user_id = e.user_id
   and lower(ts.exercise_name) = lower(e.name)
  where e.user_id = auth.uid()
  group by e.name
$$;

revoke all on function public.exercise_stats() from public, anon;
grant execute on function public.exercise_stats() to authenticated;


-- ============================================================
-- WERYFIKACJA
-- ============================================================
-- W SQL Editorze auth.uid() jest NULL, więc samo wywołanie funkcji zwróci
-- 0 wierszy — to normalne. Poniższe zapytanie liczy to samo z user_id
-- podanym wprost; podstaw swoje konto w miejsce :UID.
--
-- Interesuje Cię, czy ćwiczenia, które w UI pokazywały 0 sesji, mają tu
-- wartość niezerową — np. "Wycisk barki h" powinno mieć 4 serie / 1 sesję.

select
  e.name,
  count(distinct ts.date) as sessions,
  count(ts.id)            as sets
from public.exercises e
left join public.training_sets ts
  on ts.user_id = e.user_id
 and lower(ts.exercise_name) = lower(e.name)
where e.user_id = :UID
group by e.name
having count(ts.id) > 0
order by sessions desc, e.name;

-- Kontrola spójności: suma serii policzonych przez katalog powinna być
-- równa liczbie wierszy historii minus wiersze osierocone (nazwy bez
-- wpisu w katalogu — lista w 2026-10-25-repair-orphaned-history.sql).
select
  (select count(*) from public.training_sets where user_id = :UID) as historia_razem,
  (select count(*) from public.training_sets ts
     where ts.user_id = :UID
       and exists (select 1 from public.exercises e
                   where e.user_id = ts.user_id
                     and lower(e.name) = lower(ts.exercise_name))) as w_katalogu,
  (select count(*) from public.training_sets ts
     where ts.user_id = :UID
       and not exists (select 1 from public.exercises e
                       where e.user_id = ts.user_id
                         and lower(e.name) = lower(ts.exercise_name))) as osierocone;
