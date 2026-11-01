-- rawlogger — klucze obce na exercise_id (etap 3 migracji)
-- 2026-11-01
--
-- URUCHOM PO wdrożeniu poprawki usuwania konta z src/app/settings/page.tsx.
-- Stara wersja kasuje exercises przed ulubionymi i planami, więc po tym
-- skrypcie usunięcie konta zostawiłoby część danych.
--
-- Klucze wchodzą przed przepięciem odczytów, bo osadzanie exercises(name)
-- w PostgREST ich wymaga. Obecny kod działa bez zmian: trigger
-- tmp_sync_exercise_id wypełnia exercise_id i user_id przed sprawdzeniem
-- NOT NULL i kluczy. Kolumna exercise_name i trigger zostają na razie.
--
-- Klucz jest złożony, więc seria, plan ani ulubione nie wskażą cudzego
-- ćwiczenia. Bezpieczne do powtórzenia, całość idzie w jednej transakcji.

begin;

-- Kontrola: przy jakiejkolwiek niezgodności cała transakcja się wycofa.
do $$
declare
  v_bad bigint;
begin
  select
    (select count(*)
     from public.training_sets ts
     left join public.exercises e on e.id = ts.exercise_id and e.user_id = ts.user_id
     where e.id is null or lower(e.name) <> lower(ts.exercise_name))
    +
    (select count(*)
     from public.favorite_exercises f
     left join public.exercises e on e.id = f.exercise_id and e.user_id = f.user_id
     where e.id is null or lower(e.name) <> lower(f.exercise_name))
    +
    (select count(*)
     from public.plan_exercises pe
     join public.training_plans tp on tp.id = pe.plan_id
     left join public.exercises e on e.id = pe.exercise_id and e.user_id = pe.user_id
     where e.id is null or pe.user_id <> tp.user_id or lower(e.name) <> lower(pe.exercise_name))
  into v_bad;

  if v_bad > 0 then
    raise exception 'Niezgodne wiersze: %. Nic nie zmieniono.', v_bad;
  end if;
end $$;

alter table public.training_sets      alter column exercise_id set not null;
alter table public.favorite_exercises alter column exercise_id set not null;
alter table public.plan_exercises     alter column exercise_id set not null;
alter table public.plan_exercises     alter column user_id set not null;

alter table public.training_sets
  drop constraint if exists training_sets_exercise_fkey;
alter table public.training_sets
  add constraint training_sets_exercise_fkey
  foreign key (user_id, exercise_id)
  references public.exercises (user_id, id) on delete restrict;

alter table public.favorite_exercises
  drop constraint if exists favorite_exercises_exercise_fkey;
alter table public.favorite_exercises
  add constraint favorite_exercises_exercise_fkey
  foreign key (user_id, exercise_id)
  references public.exercises (user_id, id) on delete restrict;

alter table public.plan_exercises
  drop constraint if exists plan_exercises_exercise_fkey;
alter table public.plan_exercises
  add constraint plan_exercises_exercise_fkey
  foreign key (user_id, exercise_id)
  references public.exercises (user_id, id) on delete restrict;

commit;

-- PostgREST musi zobaczyć nowe relacje, żeby działało osadzanie.
notify pgrst, 'reload schema';


-- Weryfikacja: ma zwrócić trzy wiersze, każdy z on_delete = r (restrict).
select conrelid::regclass::text as tabela, conname as klucz, confdeltype as on_delete
from pg_constraint
where conname in (
  'training_sets_exercise_fkey',
  'favorite_exercises_exercise_fkey',
  'plan_exercises_exercise_fkey'
)
order by 1;
