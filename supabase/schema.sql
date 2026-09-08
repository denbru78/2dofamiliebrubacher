-- =====================================================================
--  FAMILIEN-LISTE – finaler Supabase-SQL-Block (idempotent)
--  Einfach komplett im Supabase SQL-Editor einfügen und "Run" klicken.
--  Kann beliebig oft ausgeführt werden.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1) TABELLEN
-- ---------------------------------------------------------------------
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Unsere Familie',
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  family_id     uuid not null references public.families(id) on delete cascade,
  display_name  text not null,
  role          text not null default 'member' check (role in ('admin','member')),
  avatar        text not null default '🙂',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.profiles add column if not exists active boolean not null default true;

create table if not exists public.settings (
  family_id          uuid primary key references public.families(id) on delete cascade,
  priorities_enabled boolean not null default true,
  weekly_goal        integer not null default 10 check (weekly_goal between 1 and 200),
  updated_at         timestamptz not null default now()
);

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  title         text not null check (char_length(trim(title)) > 0),
  description   text,
  link          text,
  cost          numeric(10,2),
  category      text not null default 'Sonstiges',
  priority      text not null default 'none' check (priority in ('none','normal','important','urgent')),
  due_kind      text not null default 'none' check (due_kind in ('none','today','tomorrow','week','weekend','someday','date')),
  due_date      date,
  assignee_ids  uuid[] not null default '{}',
  is_pool       boolean not null default true,
  status        text not null default 'open' check (status in ('open','claimed','done','archived')),
  recurrence    text not null default 'none' check (recurrence in ('none','daily','weekly','monthly','yearly')),
  recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 52),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  completed_by  uuid references public.profiles(id) on delete set null
);

-- Nachträgliche Erweiterungen (falls Tabelle schon existierte)
alter table public.tasks add column if not exists recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 52);
alter table public.tasks drop constraint if exists tasks_recurrence_check;
alter table public.tasks add constraint tasks_recurrence_check check (recurrence in ('none','daily','weekly','monthly','yearly'));

create table if not exists public.task_activity (
  id          bigserial primary key,
  family_id   uuid not null references public.families(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  task_title  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade, -- NULL = Familien-Erfolg
  key         text not null,
  unlocked_at timestamptz not null default now()
);

-- Startwerte für die automatische Profil-Anlage (E-Mail -> Name/Rolle/Avatar).
-- Diese E-Mails müssen beim Anlegen der Benutzer im Supabase-Dashboard verwendet werden.
create table if not exists public.family_seed (
  email         text primary key,
  display_name  text not null,
  role          text not null check (role in ('admin','member')),
  avatar        text not null
);

insert into public.family_seed (email, display_name, role, avatar) values
  ('papa@familie.local',    'Papa', 'admin',  '/avatars/papa.png'),
  ('mama@familie.local',    'Mama', 'admin',  '/avatars/mama.png'),
  ('tochter@familie.local', 'Mia',  'member', '/avatars/mia.png'),
  ('sohn@familie.local',    'Leo',  'member', '/avatars/leo.png')
on conflict (email) do nothing;

-- Indizes
create index if not exists tasks_family_status_idx on public.tasks (family_id, status);
create index if not exists tasks_family_completed_idx on public.tasks (family_id, completed_at desc);
create index if not exists task_activity_family_idx on public.task_activity (family_id, created_at desc);
create unique index if not exists achievements_unique_idx
  on public.achievements (family_id, key, coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Genau eine Familie anlegen (falls noch keine existiert)
insert into public.families (name)
select 'Unsere Familie' where not exists (select 1 from public.families);

insert into public.settings (family_id)
select id from public.families
on conflict (family_id) do nothing;

-- ---------------------------------------------------------------------
-- 2) HILFSFUNKTIONEN (für RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_family_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' and active from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------
-- 3) AUTOMATISCHE PROFIL-ANLAGE bei neuem Auth-Benutzer
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  fam uuid;
  seed record;
begin
  select id into fam from public.families order by created_at limit 1;
  if fam is null then
    insert into public.families (name) values ('Unsere Familie') returning id into fam;
    insert into public.settings (family_id) values (fam) on conflict do nothing;
  end if;

  select * into seed from public.family_seed where lower(email) = lower(new.email);

  insert into public.profiles (id, family_id, display_name, role, avatar)
  values (
    new.id,
    fam,
    coalesce(seed.display_name, initcap(split_part(new.email, '@', 1))),
    coalesce(seed.role, 'member'),
    coalesce(seed.avatar, '🙂')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reparatur: Profile für bereits vorhandene Benutzer ohne Profil anlegen
do $$
declare
  u record;
  fam uuid;
  seed record;
begin
  select id into fam from public.families order by created_at limit 1;
  for u in select id, email from auth.users where id not in (select id from public.profiles) loop
    select * into seed from public.family_seed where lower(email) = lower(u.email);
    insert into public.profiles (id, family_id, display_name, role, avatar)
    values (u.id, fam,
            coalesce(seed.display_name, initcap(split_part(u.email, '@', 1))),
            coalesce(seed.role, 'member'),
            coalesce(seed.avatar, '🙂'))
    on conflict (id) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) TRIGGER: Regeln für Aufgaben (serverseitig, nicht nur im Frontend)
-- ---------------------------------------------------------------------
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

-- Wiederholung: nach Abschluss automatisch die nächste Aufgabe anlegen
-- (Einfügung durch den Trigger umgeht die Admin-Prüfung über eine Session-Variable)
create or replace function public.tasks_after_done()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  base date;
  next_date date;
  n integer := greatest(1, coalesce(new.recurrence_interval, 1));
begin
  if new.status = 'done' and old.status <> 'done' and new.recurrence <> 'none' then
    base := coalesce(new.due_date, current_date);
    if base < current_date then base := current_date; end if;
    next_date := case new.recurrence
                   when 'daily'   then base + (n || ' days')::interval
                   when 'weekly'  then base + (n * 7 || ' days')::interval
                   when 'monthly' then base + (n || ' months')::interval
                   when 'yearly'  then base + (n || ' years')::interval
                 end;
    perform set_config('familie.system_insert', 'on', true);
    insert into public.tasks (family_id, title, description, link, cost, category, priority,
                              due_kind, due_date, assignee_ids, is_pool, status, recurrence, recurrence_interval, created_by)
    values (new.family_id, new.title, new.description, new.link, new.cost, new.category, new.priority,
            'date', next_date, new.assignee_ids, new.is_pool, 'open', new.recurrence, n, new.created_by);
    perform set_config('familie.system_insert', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_before_write_trg on public.tasks;
create trigger tasks_before_write_trg
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

drop trigger if exists tasks_after_done_trg on public.tasks;
create trigger tasks_after_done_trg
  after update on public.tasks
  for each row execute function public.tasks_after_done();

-- Profile: Mitglieder dürfen nur Name/Avatar ihres eigenen Profils ändern
create or replace function public.profiles_before_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.family_id <> old.family_id then
    raise exception 'Familie darf nicht geändert werden';
  end if;
  if not public.is_admin() then
    if new.role <> old.role or new.active <> old.active then
      raise exception 'Rolle und Status dürfen nicht geändert werden';
    end if;
  end if;
  if new.id = auth.uid() and (new.active = false or new.role <> old.role) then
    raise exception 'Eigene Rolle oder eigener Status können nicht geändert werden';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_before_update_trg on public.profiles;
create trigger profiles_before_update_trg
  before update on public.profiles
  for each row execute function public.profiles_before_update();

-- ---------------------------------------------------------------------
-- 5) ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.families      enable row level security;
alter table public.profiles      enable row level security;
alter table public.settings      enable row level security;
alter table public.tasks         enable row level security;
alter table public.task_activity enable row level security;
alter table public.achievements  enable row level security;
alter table public.family_seed   enable row level security;

-- families
drop policy if exists families_select on public.families;
create policy families_select on public.families
  for select to authenticated using (id = public.current_family_id());

drop policy if exists families_update on public.families;
create policy families_update on public.families
  for update to authenticated
  using (id = public.current_family_id() and public.is_admin())
  with check (id = public.current_family_id());

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or family_id = public.current_family_id());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or (family_id = public.current_family_id() and public.is_admin()))
  with check (family_id = public.current_family_id());

-- settings
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select to authenticated using (family_id = public.current_family_id());

drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings
  for update to authenticated
  using (family_id = public.current_family_id() and public.is_admin())
  with check (family_id = public.current_family_id());

drop policy if exists settings_insert on public.settings;
create policy settings_insert on public.settings
  for insert to authenticated
  with check (family_id = public.current_family_id() and public.is_admin());

-- tasks
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated using (family_id = public.current_family_id());

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (family_id = public.current_family_id() and public.is_admin());

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (family_id = public.current_family_id())      -- Details prüft der Trigger
  with check (family_id = public.current_family_id());

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (family_id = public.current_family_id() and public.is_admin());

-- task_activity
drop policy if exists activity_select on public.task_activity;
create policy activity_select on public.task_activity
  for select to authenticated using (family_id = public.current_family_id());

drop policy if exists activity_insert on public.task_activity;
create policy activity_insert on public.task_activity
  for insert to authenticated
  with check (family_id = public.current_family_id() and actor_id = auth.uid());

-- achievements
drop policy if exists achievements_select on public.achievements;
create policy achievements_select on public.achievements
  for select to authenticated using (family_id = public.current_family_id());

drop policy if exists achievements_insert on public.achievements;
create policy achievements_insert on public.achievements
  for insert to authenticated
  with check (
    family_id = public.current_family_id()
    and (profile_id is null or profile_id = auth.uid() or public.is_admin())
  );

-- family_seed: nur Admins sehen/ändern
drop policy if exists seed_admin_all on public.family_seed;
create policy seed_admin_all on public.family_seed
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 6) REALTIME (Live-Aktualisierung auf allen Geräten)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'achievements'
  ) then
    alter publication supabase_realtime add table public.achievements;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settings'
  ) then
    alter publication supabase_realtime add table public.settings;
  end if;
exception when others then
  -- Publikation existiert evtl. nicht; Realtime ist optional
  null;
end $$;

-- ---------------------------------------------------------------------
-- 7) Rechte
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- 8) KATEGORIEN + ERWEITERTE EINSTELLUNGEN
-- ---------------------------------------------------------------------
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
-- (tasks_before_write siehe oben)

-- Realtime für Kategorien
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories') then
    alter publication supabase_realtime add table public.categories;
  end if;
exception when others then null;
end $$;

-- Fertig. Jetzt die vier Benutzer im Dashboard anlegen (siehe README_DE.md).
