-- rawlogger — usunięcie exercise_name (etap 6, ostatni, migracji)
-- 2026-11-01
--
-- KROK NIEODWRACALNY bez dumpu. Uruchom po skrypcie 05 i po sprawdzeniu
-- aplikacji, ze świeżym pg_dump w ręku.
--
-- Najpierw uruchom plik bez zmian: to tylko kontrola, nic nie usuwa.
-- Gdy wszystkie liczby wynoszą 0, odkomentuj blok niżej i uruchom ponownie.
-- Usunięcie kolumn zabiera też stare ograniczenia i indeksy na exercise_name.

-- Kontrola: każda liczba ma wynosić 0.
select 'trigger nadal istnieje' as co, count(*) as wiersze
from pg_trigger where tgname = 'tmp_sync_exercise_id'
union all
select 'serie bez exercise_id', count(*)
from public.training_sets where exercise_id is null
union all
select 'ulubione bez exercise_id', count(*)
from public.favorite_exercises where exercise_id is null
union all
select 'plany bez exercise_id', count(*)
from public.plan_exercises where exercise_id is null
union all
select 'funkcje zależne od exercise_name', count(*)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc like '%exercise_name%';


-- begin;
--
-- alter table public.training_sets      drop column exercise_name;
-- alter table public.plan_exercises     drop column exercise_name;
-- alter table public.favorite_exercises drop column exercise_name;
-- alter table public.favorite_exercises drop column id;
--
-- commit;
--
-- notify pgrst, 'reload schema';
