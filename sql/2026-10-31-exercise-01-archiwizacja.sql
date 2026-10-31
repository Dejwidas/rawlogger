-- rawlogger — archiwizacja ćwiczeń (etap 0 migracji na exercise_id)
-- 2026-10-31
--
-- URUCHOM PRZED wdrożeniem kodu z gałęzi feat/exercise-archive. Nowy kod
-- filtruje po archived_at i woła ensure_exercise, a stary kod ignoruje
-- jedno i drugie, więc ta kolejność jest bezpieczna.
--
-- Unikalny indeks (user_id, lower(name)) obejmuje też wpisy zarchiwizowane,
-- więc dodanie nazwy z archiwum musi je przywrócić, a nie tworzyć drugi
-- wiersz. Robi to ensure_exercise; inaczej zwykły INSERT padałby na 23505.

begin;

alter table public.exercises
  add column if not exists archived_at timestamptz;


-- ensure_exercise: nazwa w zapisie z katalogu, wpis tworzony lub przywracany.
-- SECURITY INVOKER, bo polityka "own" na exercises w pełni wystarcza.
create or replace function public.ensure_exercise(p_name text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(p_name);
  v_canon text;
begin
  if v_uid is null then
    raise exception 'brak uwierzytelnienia' using errcode = '28000';
  end if;

  if v_name is null or v_name = '' then
    raise exception 'Nazwa nie może być pusta.' using errcode = '22023';
  end if;

  if length(v_name) > 80 then
    raise exception 'Nazwa może mieć najwyżej 80 znaków.' using errcode = '22023';
  end if;

  insert into public.exercises as e (user_id, name)
  values (v_uid, v_name)
  on conflict (user_id, lower(name))
  do update set archived_at = null
  returning e.name into v_canon;

  return v_canon;
end $$;

revoke all on function public.ensure_exercise(text) from public, anon;
grant execute on function public.ensure_exercise(text) to authenticated;


-- exercise_stats: archiwum nie ma być liczone na listach.
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
    and e.archived_at is null
  group by e.name
$$;


-- merge_exercise: scalenie do zarchiwizowanego celu ma go przywrócić, bo
-- inaczej cała scalona historia zniknęłaby z listy. Zmiana to krok 5.
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

  -- 5. słownik: źródło przestaje istnieć, cel wraca z archiwum
  delete from public.exercises e
  where e.user_id = v_uid and lower(e.name) = lower(v_from);

  update public.exercises e
  set archived_at = null
  where e.user_id = v_uid and lower(e.name) = lower(v_canon) and e.archived_at is not null;

  return jsonb_build_object(
    'ok', true, 'into', v_canon,
    'sets', v_sets, 'plans_removed', v_plans_removed
  );
end $$;

revoke all on function public.merge_exercise(text, text) from public, anon;
grant execute on function public.merge_exercise(text, text) to authenticated;

commit;
