-- rawlogger — dodanie exercise_id obok exercise_name (etap 2 migracji)
-- 2026-10-31
--
-- Faza rozszerzenia: nic nie jest usuwane, a obecny kod działa bez zmian.
-- Tymczasowy trigger trzyma obie kolumny w zgodzie w obu kierunkach, więc
-- stary kod może zapisywać nazwę, a nowy samo exercise_id. Trigger i
-- exercise_name znikną w fazie domknięcia. FK też dopiero wtedy, bo usuwanie
-- konta i scalanie muszą najpierw zostać do niego dostosowane.
--
-- Zmiana kolumn i backfill idą w jednej transakcji. Bezpieczne do powtórzenia.

begin;

-- Cel dla złożonego FK w fazie domknięcia: seria nie wskaże cudzego ćwiczenia.
alter table public.exercises
  drop constraint if exists exercises_user_id_id_key;
alter table public.exercises
  add constraint exercises_user_id_id_key unique (user_id, id);

alter table public.training_sets      add column if not exists exercise_id uuid;
alter table public.favorite_exercises add column if not exists exercise_id uuid;
alter table public.plan_exercises     add column if not exists exercise_id uuid;
alter table public.plan_exercises     add column if not exists user_id uuid;


-- Backfill idzie przed założeniem triggera.
update public.plan_exercises pe
set user_id = tp.user_id
from public.training_plans tp
where tp.id = pe.plan_id
  and pe.user_id is distinct from tp.user_id;

update public.training_sets ts
set exercise_id = e.id
from public.exercises e
where e.user_id = ts.user_id
  and lower(e.name) = lower(ts.exercise_name)
  and ts.exercise_id is distinct from e.id;

update public.favorite_exercises f
set exercise_id = e.id
from public.exercises e
where e.user_id = f.user_id
  and lower(e.name) = lower(f.exercise_name)
  and f.exercise_id is distinct from e.id;

update public.plan_exercises pe
set exercise_id = e.id
from public.exercises e
where e.user_id = pe.user_id
  and lower(e.name) = lower(pe.exercise_name)
  and pe.exercise_id is distinct from e.id;


-- SECURITY DEFINER, bo plan_exercises odczytuje właściciela z training_plans.
-- Każde zapytanie jest scopowane po new.user_id, a RLS sprawdza wiersz po
-- triggerze BEFORE, więc podanie cudzego user_id i tak zostanie odrzucone.
create or replace function public.tmp_sync_exercise_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by_id boolean;
begin
  if tg_table_name = 'plan_exercises' then
    select tp.user_id into new.user_id
    from public.training_plans tp
    where tp.id = new.plan_id;
  end if;

  v_by_id := new.exercise_id is not null and (
    tg_op = 'INSERT' and new.exercise_name is null
    or tg_op = 'UPDATE' and new.exercise_id is distinct from old.exercise_id
  );

  if v_by_id then
    select e.name into new.exercise_name
    from public.exercises e
    where e.id = new.exercise_id and e.user_id = new.user_id;

    if new.exercise_name is null then
      raise exception 'ćwiczenie % nie należy do użytkownika', new.exercise_id
        using errcode = '23503';
    end if;

    return new;
  end if;

  select e.id into new.exercise_id
  from public.exercises e
  where e.user_id = new.user_id and lower(e.name) = lower(new.exercise_name);

  if new.exercise_id is null then
    insert into public.exercises as e (user_id, name, archived_at)
    values (new.user_id, new.exercise_name, now())
    on conflict (user_id, lower(name)) do update set name = e.name
    returning e.id into new.exercise_id;
  end if;

  return new;
end $$;

revoke all on function public.tmp_sync_exercise_id() from public, anon, authenticated;

create or replace trigger tmp_sync_exercise_id
  before insert or update of exercise_name, exercise_id on public.training_sets
  for each row execute function public.tmp_sync_exercise_id();

create or replace trigger tmp_sync_exercise_id
  before insert or update of exercise_name, exercise_id on public.favorite_exercises
  for each row execute function public.tmp_sync_exercise_id();

create or replace trigger tmp_sync_exercise_id
  before insert or update of exercise_name, exercise_id, plan_id on public.plan_exercises
  for each row execute function public.tmp_sync_exercise_id();


create index if not exists training_sets_user_exercise_idx
  on public.training_sets (user_id, exercise_id);
create index if not exists plan_exercises_exercise_idx
  on public.plan_exercises (exercise_id);
create index if not exists favorite_exercises_exercise_idx
  on public.favorite_exercises (exercise_id);

commit;


-- Weryfikacja: każda liczba ma wynosić 0.
select 'serie bez exercise_id' as co, count(*) as wiersze
from public.training_sets where exercise_id is null
union all
select 'ulubione bez exercise_id', count(*)
from public.favorite_exercises where exercise_id is null
union all
select 'plany bez exercise_id', count(*)
from public.plan_exercises where exercise_id is null
union all
select 'plany bez user_id', count(*)
from public.plan_exercises where user_id is null
union all
select 'serie z cudzym lub innym cwiczeniem', count(*)
from public.training_sets ts
left join public.exercises e on e.id = ts.exercise_id and e.user_id = ts.user_id
where e.id is null or lower(e.name) <> lower(ts.exercise_name);
