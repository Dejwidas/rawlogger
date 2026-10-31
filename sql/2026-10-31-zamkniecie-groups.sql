-- rawlogger — zamknięcie tabel groups i user_groups
-- 2026-10-31
--
-- Obie tabele mają politykę "public all" z USING (true), więc klucz publiczny
-- pozwalał je czytać i zmieniać bez logowania. Są puste, a kod aplikacji ich
-- nie używa. RLS zostaje włączone, więc po usunięciu polityk API nie ma do
-- nich dostępu. Gdy powstanie funkcja grup, dostaną właściwe polityki.

drop policy if exists "public all" on public.groups;
drop policy if exists "public all" on public.user_groups;

-- Kontrola: oba zapytania mają zwrócić 0 wierszy.
select tablename, policyname from pg_policies
where schemaname = 'public' and tablename in ('groups', 'user_groups');
