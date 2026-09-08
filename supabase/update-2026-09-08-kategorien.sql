-- =====================================================================
--  FAMILIEN-LISTE – Update: Kategorien-Tabelle + Familieneinstellungen
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
--  Voraussetzung: Updates "Wiederholungen" und "Rollen" wurden ausgeführt.
-- =====================================================================

-- 1) Familieneinstellungen erweitern
alter table public.settings add column if not exists kids_can_claim_pool boolean not null default true;
alter table public.settings add column if not exists achievements_enabled boolean not null default true;

-- 2) Kategorien pro Familie
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  name        text not null check (char_length(trim(name)) > 0),
  icon        text not null default '✨',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (family_id, name)
);

alter table public.categories enable row level security;

drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated using (family_id = public.current_family_id());

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all to authenticated
  using (family_id = public.current_family_id() and public.is_admin())
  with check (family_id = public.current_family_id() and public.is_admin());

grant select, insert, update, delete on public.categories to authenticated;

-- Standardkategorien für jede Familie anlegen (falls noch keine vorhanden)
insert into public.categories (family_id, name, icon, sort_order)
select f.id, c.name, c.icon, c.sort_order
from public.families f
cross join (values
  ('Haus & Haushalt',        '🏠', 10),
  ('Garten',                 '🌿', 20),
  ('Auto & Mobilität',       '🚗', 30),
  ('Besorgen & Kaufen',      '🛒', 40),
  ('Prüfen & Recherchieren', '🔍', 50),
  ('Familie & Kinder',       '👨‍👩‍👧‍👦', 60),
  ('Organisation',           '📋', 70),
  ('Sonstiges',              '✨', 80)
) as c(name, icon, sort_order)
on conflict (family_id, name) do nothing;

-- Umbenennen einer Kategorie zieht die Aufgaben mit
create or replace function public.categories_after_rename()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.tasks set category = new.name
    where family_id = new.family_id and category = old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_after_rename_trg on public.categories;
create trigger categories_after_rename_trg
  after update on public.categories
  for each row execute function public.categories_after_rename();

-- Löschen einer Kategorie: Aufgaben wandern nach "Sonstiges"
create or replace function public.categories_before_delete()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.name = 'Sonstiges' then
    raise exception 'Die Kategorie „Sonstiges“ kann nicht gelöscht werden';
  end if;
  update public.tasks set category = 'Sonstiges'
  where family_id = old.family_id and category = old.name;
  return old;
end;
$$;

drop trigger if exists categories_before_delete_trg on public.categories;
create trigger categories_before_delete_trg
  before delete on public.categories
  for each row execute function public.categories_before_delete();

-- Neue Familien bekommen automatisch Standardkategorien
create or replace function public.families_after_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.settings (family_id) values (new.id) on conflict do nothing;
  insert into public.categories (family_id, name, icon, sort_order) values
    (new.id, 'Haus & Haushalt', '🏠', 10),
    (new.id, 'Garten', '🌿', 20),
    (new.id, 'Auto & Mobilität', '🚗', 30),
    (new.id, 'Besorgen & Kaufen', '🛒', 40),
    (new.id, 'Prüfen & Recherchieren', '🔍', 50),
    (new.id, 'Familie & Kinder', '👨‍👩‍👧‍👦', 60),
    (new.id, 'Organisation', '📋', 70),
    (new.id, 'Sonstiges', '✨', 80)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists families_after_insert_trg on public.families;
create trigger families_after_insert_trg
  after insert on public.families
  for each row execute function public.families_after_insert();

-- 3) Pool-Übernahme durch Kinder per Einstellung sperrbar
create or replace function public.tasks_before_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  admin boolean := public.is_admin();
  sys boolean := coalesce(current_setting('familie.system_insert', true), '') = 'on';
  kids_claim boolean := coalesce((select kids_can_claim_pool from public.settings where family_id = coalesce(old.family_id, new.family_id)), true);
begin
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then
    raise exception 'family_id darf nicht geändert werden';
  end if;

  if tg_op = 'INSERT' then
    if not admin and not sys then
      raise exception 'Nur Eltern (Admins) dürfen Aufgaben anlegen';
    end if;
    if not sys then
      new.family_id := public.current_family_id();
      new.created_by := uid;
    end if;
    if new.due_kind in ('none','someday') then new.due_date := null; end if;
    if array_length(new.assignee_ids, 1) is null then
      new.is_pool := true;
    else
      new.is_pool := false;
    end if;
    if new.status = 'done' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, uid);
    end if;
    return new;
  end if;

  new.updated_at := now();

  if not admin then
    if old.is_pool and old.status = 'open'
       and new.is_pool = false and new.status = 'claimed'
       and new.assignee_ids = array[uid] then
      if not kids_claim then
        raise exception 'Pool-Aufgaben dürfen aktuell nur von Eltern verteilt werden';
      end if;
    elsif old.status in ('open','claimed') and new.status = 'done'
       and uid = any(old.assignee_ids)
       and new.assignee_ids = old.assignee_ids
       and new.is_pool = old.is_pool then
      null;
    elsif old.status = 'done' and new.status in ('open','claimed')
       and old.completed_by = uid
       and old.completed_at > now() - interval '5 minutes'
       and new.assignee_ids = old.assignee_ids
       and new.is_pool = old.is_pool then
      null;
    else
      raise exception 'Keine Berechtigung für diese Änderung';
    end if;

    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.link is distinct from old.link
       or new.cost is distinct from old.cost
       or new.category is distinct from old.category
       or new.priority is distinct from old.priority
       or new.due_kind is distinct from old.due_kind
       or new.due_date is distinct from old.due_date
       or new.recurrence is distinct from old.recurrence
       or new.recurrence_interval is distinct from old.recurrence_interval
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Mitglieder dürfen Aufgaben nicht bearbeiten';
    end if;
  end if;

  if new.is_pool then
    new.assignee_ids := '{}';
  elsif array_length(new.assignee_ids, 1) is null and admin then
    new.is_pool := true;
  end if;

  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, uid);
  elsif new.status in ('open','claimed') and old.status in ('done','archived') then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

-- Realtime für Kategorien
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories') then
    alter publication supabase_realtime add table public.categories;
  end if;
exception when others then null;
end $$;
