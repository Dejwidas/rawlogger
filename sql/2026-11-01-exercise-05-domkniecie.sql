-- rawlogger — funkcje na exercise_id, koniec triggera (etap 5 migracji)
-- 2026-11-01
--
-- URUCHOM PO wdrożeniu kodu z feat/exercise-id-code. Kod musi już zapisywać
-- exercise_id, bo od teraz nic nie uzupełnia go z nazwy.
--
-- Żadne dane nie są tu usuwane. exercise_name zostaje na czas sprawdzenia
-- aplikacji, ale przestaje być utrzymywane: nowe wiersze mają tam NULL,
-- a zmiana nazwy nie przepisuje starych. Kolumny usuwa skrypt 06.
--
-- Trigger pilnował też, że plan_exercises.user_id jest właścicielem planu.
-- Przejmują to klucz obcy (plan_id, user_id) i polityka RLS po user_id.
-- Sygnatury i odpowiedzi funkcji się nie zmieniają, więc kod ich nie odczuje.
--
-- Bezpieczne do powtórzenia do czasu uruchomienia skryptu 06.

begin;

-- Dopóki istnieją trigger i exercise_name, nie mogą się rozjechać nazwy.
do $$
declare
  v_bad bigint;
begin
  select
    (select count(*)
     from public.training_sets ts
     join public.exercises e on e.id = ts.exercise_id
     where lower(e.name) <> lower(ts.exercise_name))
    +
    (select count(*)
     from public.favorite_exercises f
     join public.exercises e on e.id = f.exercise_id
     where lower(e.name) <> lower(f.exercise_name))
    +
    (select count(*)
     from public.plan_exercises pe
     join public.exercises e on e.id = pe.exercise_id
     where lower(e.name) <> lower(pe.exercise_name))
  into v_bad;

  if v_bad > 0 then
    raise exception 'Niezgodne wiersze: %. Nic nie zmieniono.', v_bad;
  end if;
end $$;


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
   and ts.exercise_id = e.id
  where e.user_id = auth.uid()
    and e.archived_at is null
  group by e.name
$$;


-- rename_exercise: nazwa żyje tylko w katalogu. Liczby są do komunikatu w UI.
-- SECURITY DEFINER zostaje, więc każde zapytanie jest scopowane po v_uid.
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
  v_id    uuid;
  v_target text;
  v_target_id uuid;
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

  -- Sama zmiana wielkości liter tej samej nazwy to nie duplikat.
  if lower(v_new) <> lower(v_old) then
    select e.id, e.name into v_target_id, v_target
    from public.exercises e
    where e.user_id = v_uid and lower(e.name) = lower(v_new);

    if v_target_id is not null then
      return jsonb_build_object(
        'ok', false,
        'reason', 'duplicate',
        'target', v_target,
        'target_sets', (
          select count(*) from public.training_sets ts
          where ts.user_id = v_uid and ts.exercise_id = v_target_id
        )
      );
    end if;
  end if;

  update public.exercises e
  set name = v_new
  where e.user_id = v_uid and lower(e.name) = lower(v_old)
  returning e.id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true, 'name', v_new,
    'sets', (select count(*) from public.training_sets ts
             where ts.user_id = v_uid and ts.exercise_id = v_id),
    'favorites', (select count(*) from public.favorite_exercises f
                  where f.user_id = v_uid and f.exercise_id = v_id),
    'plans', (select count(*) from public.plan_exercises pe
              where pe.user_id = v_uid and pe.exercise_id = v_id)
  );
end $$;

revoke all on function public.rename_exercise(text, text) from public, anon;
grant execute on function public.rename_exercise(text, text) to authenticated;


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
  v_from_id uuid;
  v_into_id uuid;
  v_canon text;
  v_sets int;
  v_plans_removed int;
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

  select e.id, e.name into v_into_id, v_canon
  from public.exercises e
  where e.user_id = v_uid and lower(e.name) = lower(v_into);

  if v_into_id is null then
    return jsonb_build_object('ok', false, 'reason', 'target_not_found');
  end if;

  select e.id into v_from_id
  from public.exercises e
  where e.user_id = v_uid and lower(e.name) = lower(v_from);

  if v_from_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- 1. historia serii
  update public.training_sets ts
  set exercise_id = v_into_id
  where ts.user_id = v_uid and ts.exercise_id = v_from_id;
  get diagnostics v_sets = row_count;

  -- 2. jeden display_order na dzień dla scalonej grupy
  update public.training_sets ts
  set display_order = f.mo
  from (
    select ts2.date, min(ts2.display_order) as mo
    from public.training_sets ts2
    where ts2.user_id = v_uid and ts2.exercise_id = v_into_id
    group by ts2.date
  ) f
  where ts.user_id = v_uid
    and ts.exercise_id = v_into_id
    and ts.date = f.date
    and ts.display_order <> f.mo;

  -- 3. ulubione: gwiazdka przechodzi, jeśli miało ją którekolwiek z dwóch
  if exists (
    select 1 from public.favorite_exercises f
    where f.user_id = v_uid and f.exercise_id = v_into_id
  ) then
    delete from public.favorite_exercises f
    where f.user_id = v_uid and f.exercise_id = v_from_id;
  else
    update public.favorite_exercises f
    set exercise_id = v_into_id
    where f.user_id = v_uid and f.exercise_id = v_from_id;
  end if;

  -- 4. plany: zostaje wpis o najmniejszej position
  update public.plan_exercises pe
  set exercise_id = v_into_id
  where pe.user_id = v_uid and pe.exercise_id = v_from_id;

  with ranked as (
    select pe.id,
           row_number() over (partition by pe.plan_id order by pe.position, pe.id) as rn
    from public.plan_exercises pe
    where pe.user_id = v_uid and pe.exercise_id = v_into_id
  )
  delete from public.plan_exercises pe
  using ranked r
  where pe.id = r.id and r.rn > 1;
  get diagnostics v_plans_removed = row_count;

  -- 5. słownik: źródło przestaje istnieć, cel wraca z archiwum
  delete from public.exercises e
  where e.user_id = v_uid and e.id = v_from_id;

  update public.exercises e
  set archived_at = null
  where e.user_id = v_uid and e.id = v_into_id and e.archived_at is not null;

  return jsonb_build_object(
    'ok', true, 'into', v_canon,
    'sets', v_sets, 'plans_removed', v_plans_removed
  );
end $$;

revoke all on function public.merge_exercise(text, text) from public, anon;
grant execute on function public.merge_exercise(text, text) to authenticated;


-- Właściciel wpisu w planie: złożony klucz zastępuje zwykły po plan_id.
alter table public.plan_exercises
  drop constraint if exists plan_exercises_plan_owner_fkey;
alter table public.training_plans
  drop constraint if exists training_plans_id_user_id_key;
alter table public.training_plans
  add constraint training_plans_id_user_id_key unique (id, user_id);
alter table public.plan_exercises
  add constraint plan_exercises_plan_owner_fkey
  foreign key (plan_id, user_id) references public.training_plans (id, user_id);
alter table public.plan_exercises
  drop constraint if exists plan_exercises_plan_id_fkey;

drop policy if exists own on public.plan_exercises;
create policy own on public.plan_exercises
  using (auth.uid() = user_id);


-- Ulubione: tożsamością wpisu staje się ćwiczenie. Kolumnę id usuwa skrypt 06.
alter table public.favorite_exercises
  drop constraint if exists favorite_exercises_pkey;
alter table public.favorite_exercises
  add constraint favorite_exercises_pkey primary key (user_id, exercise_id);


drop trigger if exists tmp_sync_exercise_id on public.training_sets;
drop trigger if exists tmp_sync_exercise_id on public.favorite_exercises;
drop trigger if exists tmp_sync_exercise_id on public.plan_exercises;
drop function if exists public.tmp_sync_exercise_id();

alter table public.training_sets      alter column exercise_name drop not null;
alter table public.favorite_exercises alter column exercise_name drop not null;
alter table public.plan_exercises     alter column exercise_name drop not null;

commit;

notify pgrst, 'reload schema';


-- Weryfikacja: ma zwrócić jeden wiersz z triggers = 0 i keys = 2.
select
  (select count(*) from pg_trigger where tgname = 'tmp_sync_exercise_id') as triggers,
  (select count(*) from pg_constraint
   where conname in ('plan_exercises_plan_owner_fkey', 'training_plans_id_user_id_key')) as keys;
