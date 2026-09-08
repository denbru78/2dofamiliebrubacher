-- =====================================================================
--  FAMILIEN-LISTE – Update: Datenschutz & Sicherheit V1
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================

-- 1) RLS auf ALLEN App-Tabellen sicherstellen (auch falls eine Tabelle sie verloren hat)
do $$
declare t text;
begin
  foreach t in array array['families','profiles','settings','tasks','task_activity','achievements','family_seed',
                           'categories','notifications','push_subscriptions','weekly_results','family_invites'] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- Familien können nur über die geprüften Funktionen entstehen (create_family / Auth-Trigger), nicht direkt
drop policy if exists families_insert on public.families;
revoke insert on public.families from authenticated;
revoke delete on public.families from authenticated;

-- Historie ist unveränderlich: kein Update/Delete durch Nutzer
revoke update, delete on public.task_activity from authenticated;

-- Wochen-Historie wird nur von Triggern gepflegt
revoke insert, update, delete on public.weekly_results from authenticated;

-- 2) Spätere saubere Unterscheidung: deaktivieren (active=false) / Konto löschen / Familie löschen
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.families add column if not exists deleted_at timestamptz;

-- 3) Storage für spätere Fotos/Dateien: privater Bucket, Pfad family_id/task_id/datei
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-files', 'task-files', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update set public = false;

drop policy if exists task_files_select on storage.objects;
create policy task_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'task-files' and (storage.foldername(name))[1] = public.current_family_id()::text);

drop policy if exists task_files_insert on storage.objects;
create policy task_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-files' and (storage.foldername(name))[1] = public.current_family_id()::text);

drop policy if exists task_files_update on storage.objects;
create policy task_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'task-files' and (storage.foldername(name))[1] = public.current_family_id()::text);

drop policy if exists task_files_delete on storage.objects;
create policy task_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-files' and (storage.foldername(name))[1] = public.current_family_id()::text and public.is_admin());

-- 4) Sicherheits-Selbstprüfung (nur lesend): zeigt RLS-Status aller App-Tabellen
create or replace function public.security_check()
returns table (tabelle text, rls_aktiv boolean, policies integer)
language sql stable security definer
set search_path = public
as $$
  select c.relname::text, c.relrowsecurity,
         (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by 1;
$$;
grant execute on function public.security_check() to authenticated;

-- Ergebnis direkt anzeigen:
select * from public.security_check();
