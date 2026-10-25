-- rawlogger — naprawa kolejności ćwiczeń i zapisu notatek
-- 2026-10-25
--
-- NIE uruchamiaj całości na raz. Idź sekcjami, patrząc na wynik każdej.
-- Sekcje 0 i 1a to tylko SELECT-y (diagnostyka). Sekcja 1b USUWA dane —
-- uruchom ją tylko jeśli 1a pokaże duplikaty.


-- ============================================================
-- 0. DIAGNOSTYKA (tylko odczyt — uruchom najpierw i zachowaj wynik)
-- ============================================================

-- 0a. Czy istnieje unikalny indeks na training_notes(user_id, date)?
--     Jeśli NIE ma tu nic z "UNIQUE ... (user_id, date)" — to jest przyczyna
--     niezapisujących się notatek: upsert z onConflict wymaga tego indeksu.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'training_notes';

-- 0b. Jakie są polityki RLS? Interesuje nas, czy training_notes ma policy
--     dla UPDATE (bez niej pierwszy zapis notatki przechodzi, a każda
--     późniejsza edycja pada na 42501).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('training_notes', 'training_sets')
order by tablename, cmd;

-- 0c. Ile wierszy ma display_order = NULL (czyli kolejność "nieznaną")?
select
  count(*)                                        as wszystkie,
  count(*) filter (where display_order is null)    as bez_kolejnosci,
  count(distinct (user_id, date))                  as dni
from training_sets;


-- ============================================================
-- 1. NOTATKI — unikalny indeks dla upsertu
-- ============================================================

-- 1a. Najpierw sprawdź, czy są duplikaty (user_id, date).
--     Jeśli zwróci 0 wierszy — pomiń 1b i przejdź do 1c.
select user_id, date, count(*) as ile
from training_notes
group by user_id, date
having count(*) > 1
order by ile desc;

-- 1b. TYLKO jeśli 1a pokazało duplikaty: zostawia najświeższy wpis
--     dla każdego (user_id, date), reszta leci. SPRAWDŹ 1a PRZED URUCHOMIENIEM.
-- with ranked as (
--   select id, row_number() over (
--            partition by user_id, date
--            order by coalesce(updated_at, '-infinity'::timestamptz) desc, id desc
--          ) as rn
--   from training_notes
-- )
-- delete from training_notes tn
-- using ranked r
-- where tn.id = r.id and r.rn > 1;

-- 1c. Właściwa naprawa: indeks, którego wymaga onConflict: 'user_id,date'.
create unique index if not exists training_notes_user_date_key
  on public.training_notes (user_id, date);


-- ============================================================
-- 2. NOTATKI — brakujące polityki RLS
-- ============================================================
-- Dokłada tylko to, czego brakuje; istniejących polityk nie rusza.
-- Jeśli 0b pokazało, że masz już własne polityki dla danego polecenia,
-- ten blok je zostawi w spokoju.

alter table public.training_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_notes' and cmd = 'SELECT'
  ) then
    create policy training_notes_select_own on public.training_notes
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_notes' and cmd = 'INSERT'
  ) then
    create policy training_notes_insert_own on public.training_notes
      for insert with check (auth.uid() = user_id);
  end if;

  -- najczęstsza luka: upsert trafiający na istniejący wiersz robi UPDATE
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_notes' and cmd = 'UPDATE'
  ) then
    create policy training_notes_update_own on public.training_notes
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_notes' and cmd = 'DELETE'
  ) then
    create policy training_notes_delete_own on public.training_notes
      for delete using (auth.uid() = user_id);
  end if;
end $$;


-- ============================================================
-- 3. KOLEJNOŚĆ ĆWICZEŃ — backfill display_order dla starych treningów
-- ============================================================
-- Numeruje ćwiczenia w obrębie każdego (user_id, date) gęsto od 0.
-- Kolejność wyznacza:
--   1) istniejący display_order (Twoje ręczne przestawienia mają priorytet),
--   2) created_at najstarszej serii danego ćwiczenia — dla grup z NULL-em,
--   3) nazwa ćwiczenia jako rozstrzygnięcie remisu.
-- Wszystkie serie jednego ćwiczenia w danym dniu dostają ten sam numer —
-- dokładnie tak, jak to robi moveGroup w aplikacji.

with groups as (
  select
    user_id,
    date,
    exercise_name,
    min(display_order) as cur_order,
    min(created_at)    as first_created
  from training_sets
  group by user_id, date, exercise_name
),
ranked as (
  select
    user_id,
    date,
    exercise_name,
    (row_number() over (
       partition by user_id, date
       order by coalesce(cur_order, 2147483647), first_created, exercise_name
     ) - 1) as new_order
  from groups
)
update training_sets ts
set display_order = r.new_order
from ranked r
where ts.user_id       = r.user_id
  and ts.date          = r.date
  and ts.exercise_name = r.exercise_name
  and ts.display_order is distinct from r.new_order;

-- Weryfikacja: po backfillu powinno być 0 NULL-i.
select count(*) as nadal_null from training_sets where display_order is null;


-- ============================================================
-- 4. KOLEJNOŚĆ ĆWICZEŃ — utwardzenie (opcjonalne, ale polecane)
-- ============================================================
-- Default + NOT NULL sprawiają, że NULL-owy display_order nie wróci,
-- nawet jeśli jakieś przyszłe miejsce w kodzie zapomni go ustawić.
-- Uruchom DOPIERO gdy zapytanie weryfikujące z sekcji 3 zwróciło 0.

alter table public.training_sets alter column display_order set default 0;
alter table public.training_sets alter column display_order set not null;

-- Indeks pod zapytanie, którym aplikacja wczytuje dzień treningowy.
create index if not exists training_sets_user_date_order_idx
  on public.training_sets (user_id, date, display_order);
