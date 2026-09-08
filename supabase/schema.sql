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
  color         text,
  created_at    timestamptz not null default now()
);
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists color text;

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
  key         text not null,        -- achievement_type
  title       text,
  description text,
  icon_key    text,
  unlocked_at timestamptz not null default now()  -- earned_at
);
alter table public.achievements add column if not exists title text;
alter table public.achievements add column if not exists description text;
alter table public.achievements add column if not exists icon_key text;

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
  -- Nur die vier festen Seed-Adressen bekommen automatisch ein Profil in der Familie.
  -- Alle anderen Nutzer bleiben ohne family_id (Onboarding: Familie erstellen / Einladung annehmen).
  select * into seed from public.family_seed where lower(email) = lower(new.email);
  if seed.email is not null then
    select id into fam from public.families order by created_at limit 1;
    if fam is null then
      insert into public.families (name, created_by) values ('Unsere Familie', new.id) returning id into fam;
    end if;
    insert into public.profiles (id, family_id, display_name, role, avatar, color)
    values (new.id, fam, seed.display_name, seed.role, seed.avatar,
            case seed.avatar when '/avatars/papa.png' then 'sage' when '/avatars/mama.png' then 'rose'
                             when '/avatars/mia.png' then 'pink' when '/avatars/leo.png' then 'blue' else 'grey' end)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reparatur: Profile NUR für die vier festen Seed-Konten (family_seed) nachtragen.
-- Fremde oder frisch registrierte Nutzer bleiben ohne Familie und laufen über
-- "Familie erstellen" bzw. "Einladung annehmen". Bestehende Zuordnungen werden nie verändert.
do $$
declare
  u record;
  fam uuid;
  seed record;
begin
  select id into fam from public.families order by created_at limit 1;
  if fam is null then return; end if;
  for u in
    select au.id, au.email from auth.users au
    where au.id not in (select id from public.profiles)
      and lower(au.email) in (select lower(email) from public.family_seed)
  loop
    select * into seed from public.family_seed where lower(email) = lower(u.email);
    insert into public.profiles (id, family_id, display_name, role, avatar, color)
    values (u.id, fam, seed.display_name, seed.role, seed.avatar,
            case seed.avatar when '/avatars/papa.png' then 'sage' when '/avatars/mama.png' then 'rose'
                             when '/avatars/mia.png' then 'pink' when '/avatars/leo.png' then 'blue' else 'grey' end)
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
  else
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
         or new.reminder_type is distinct from old.reminder_type
         or new.reminder_at is distinct from old.reminder_at
         or new.recurrence is distinct from old.recurrence
         or new.recurrence_interval is distinct from old.recurrence_interval
         or new.recurrence_enabled is distinct from old.recurrence_enabled
         or new.series_template is distinct from old.series_template
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
  end if;

  -- Erinnerung
  if new.due_date is null and new.reminder_type in ('due_morning','day_before') then
    new.reminder_type := 'none';
  end if;
  if new.reminder_type = 'none' then
    new.reminder_at := null;
  elsif new.reminder_type = 'due_morning' then
    new.reminder_at := (new.due_date::timestamp + time '08:00') at time zone 'Europe/Berlin';
  elsif new.reminder_type = 'day_before' then
    new.reminder_at := ((new.due_date - 1)::timestamp + time '08:00') at time zone 'Europe/Berlin';
  end if;

  -- Serie
  new.recurrence_enabled := (new.recurrence <> 'none');
  if new.recurrence_enabled then
    if new.series_id is null then new.series_id := new.id; end if;
    new.next_due_date := public.next_due(new.due_date, new.recurrence, new.recurrence_interval);
    -- Vorlage für Folgeaufgaben: neu aufbauen, wenn leer (Serie geändert) oder Regel geändert
    if new.series_template is null
       or (tg_op = 'UPDATE' and (new.recurrence is distinct from old.recurrence or new.recurrence_interval is distinct from old.recurrence_interval)) then
      new.series_template := jsonb_build_object(
        'title', new.title, 'description', new.description, 'link', new.link, 'cost', new.cost,
        'category', new.category, 'priority', new.priority, 'assignee_ids', to_jsonb(new.assignee_ids),
        'is_pool', new.is_pool, 'recurrence', new.recurrence, 'recurrence_interval', new.recurrence_interval,
        'reminder_type', case when new.reminder_type = 'custom' then 'none' else new.reminder_type end);
    end if;
  else
    new.next_due_date := null;
    new.series_template := null;
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
  t jsonb;
  ids uuid[];
  next_date date;
  f record;
begin
  -- Abschluss: Folgeaufgabe aus der Serienvorlage anlegen (alte Aufgabe bleibt erhalten)
  if new.status = 'done' and old.status <> 'done' and new.recurrence_enabled and new.recurrence <> 'none' then
    t := coalesce(new.series_template, '{}'::jsonb);
    select coalesce(array_agg(x::uuid), '{}') into ids from jsonb_array_elements_text(coalesce(t->'assignee_ids', to_jsonb(new.assignee_ids))) as x;
    next_date := public.next_due(new.due_date, new.recurrence, new.recurrence_interval);
    perform set_config('familie.system_insert', 'on', true);
    insert into public.tasks (family_id, title, description, link, cost, category, priority,
                              due_kind, due_date, assignee_ids, is_pool, status, recurrence, recurrence_interval,
                              created_by, reminder_type, series_id, parent_task_id, series_template)
    values (new.family_id,
            coalesce(t->>'title', new.title), coalesce(t->>'description', new.description),
            coalesce(t->>'link', new.link), coalesce((t->>'cost')::numeric, new.cost),
            coalesce(t->>'category', new.category), coalesce(t->>'priority', new.priority),
            'date', next_date, ids, coalesce((t->>'is_pool')::boolean, new.is_pool), 'open',
            new.recurrence, new.recurrence_interval, new.created_by,
            coalesce(t->>'reminder_type', 'none'),
            coalesce(new.series_id, new.id), new.id, t);
    perform set_config('familie.system_insert', 'off', true);
  end if;

  -- Rückgängig: Folgeaufgabe genau dieses Abschlusses entfernen, aber nur wenn sie unberührt ist
  if old.status = 'done' and new.status in ('open','claimed') and new.recurrence <> 'none' then
    for f in
      select * from public.tasks
      where parent_task_id = new.id
        and status = 'open'
        and completed_at is null
        and updated_at = created_at                      -- nie bearbeitet, nie übernommen
        and not exists (
          select 1 from public.task_activity a
          where a.task_id = tasks.id and a.action <> 'created'   -- keine weitere Aktivität
        )
    loop
      perform set_config('familie.undo_series', 'on', true);
      delete from public.tasks where id = f.id;
      perform set_config('familie.undo_series', 'off', true);
    end loop;
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
  icon        text not null default 'sparkle',
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
  ('Haus & Haushalt',        'home', 10),
  ('Garten',                 'leaf', 20),
  ('Auto & Mobilität',       'car', 30),
  ('Besorgen & Kaufen',      'cart', 40),
  ('Prüfen & Recherchieren', 'search', 50),
  ('Familie & Kinder',       'family', 60),
  ('Organisation',           'clipboard', 70),
  ('Sonstiges',              'sparkle', 80)
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
    (new.id, 'Haus & Haushalt', 'home', 10),
    (new.id, 'Garten', 'leaf', 20),
    (new.id, 'Auto & Mobilität', 'car', 30),
    (new.id, 'Besorgen & Kaufen', 'cart', 40),
    (new.id, 'Prüfen & Recherchieren', 'search', 50),
    (new.id, 'Familie & Kinder', 'family', 60),
    (new.id, 'Organisation', 'clipboard', 70),
    (new.id, 'Sonstiges', 'sparkle', 80)
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

-- ---------------------------------------------------------------------
-- 9) ERINNERUNGEN, MITTEILUNGEN, PUSH-VORBEREITUNG
-- ---------------------------------------------------------------------
-- 1) Aufgaben: Erinnerung
alter table public.tasks add column if not exists reminder_type text not null default 'none';
alter table public.tasks drop constraint if exists tasks_reminder_type_check;
alter table public.tasks add constraint tasks_reminder_type_check
  check (reminder_type in ('none','due_morning','day_before','custom'));
alter table public.tasks add column if not exists reminder_at timestamptz;
create index if not exists tasks_reminder_idx on public.tasks (family_id, reminder_at) where reminder_at is not null;

-- 2) Profile: Handynummer für WhatsApp (optional)
alter table public.profiles add column if not exists phone text;

-- 3) Einstellungen
alter table public.settings add column if not exists reminders_enabled boolean not null default true;

-- 4) Mitteilungen (Sammelmeldungen, in-App; Push kann später andocken)
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade, -- NULL = ganze Familie
  type        text not null,  -- assigned | claimed | weekly_goal | due_today | overdue | digest
  title       text not null,
  body        text,
  task_id     uuid references public.tasks(id) on delete set null,
  read_by     uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists notifications_family_idx on public.notifications (family_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (family_id = public.current_family_id() and (profile_id is null or profile_id = auth.uid() or public.is_admin()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (family_id = public.current_family_id() and public.is_admin());

grant select, update, delete on public.notifications to authenticated;

-- 5) Push-Abos (Vorbereitung; V1 versendet noch nichts)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- 7) Trigger: Mitteilungen erzeugen (nur Ereignisse, keine Flut)
create or replace function public.tasks_after_write_notify()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  actor_name text := coalesce((select display_name from public.profiles where id = uid), 'Jemand');
  pid uuid;
  goal integer;
  done_week integer;
  wk_start timestamptz := date_trunc('week', (now() at time zone 'Europe/Berlin'))::timestamp at time zone 'Europe/Berlin';
  sys boolean := coalesce(current_setting('familie.system_insert', true), '') = 'on';
begin
  if not sys and not new.is_pool and new.status in ('open','claimed') then
    foreach pid in array new.assignee_ids loop
      if pid <> coalesce(uid, '00000000-0000-0000-0000-000000000000'::uuid)
         and (tg_op = 'INSERT' or not (pid = any(old.assignee_ids))) then
        insert into public.notifications (family_id, profile_id, type, title, body, task_id)
        values (new.family_id, pid, 'assigned', 'Neue Aufgabe für dich', actor_name || ' hat dir „' || new.title || '“ zugewiesen.', new.id);
      end if;
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    if old.is_pool and not new.is_pool and new.status = 'claimed' then
      insert into public.notifications (family_id, profile_id, type, title, body, task_id)
      values (new.family_id, null, 'claimed', 'Pool-Aufgabe übernommen', actor_name || ' übernimmt „' || new.title || '“.', new.id);
    end if;

    if new.status = 'done' and old.status <> 'done' then
      select weekly_goal into goal from public.settings where family_id = new.family_id;
      select count(*) into done_week from public.tasks
        where family_id = new.family_id and status in ('done','archived') and completed_at >= wk_start;
      if goal is not null and done_week = goal
         and not exists (select 1 from public.notifications where family_id = new.family_id and type = 'weekly_goal' and created_at >= wk_start) then
        insert into public.notifications (family_id, profile_id, type, title, body)
        values (new.family_id, null, 'weekly_goal', 'Wochenziel erreicht', 'Ihr habt diese Woche ' || goal || ' Aufgaben geschafft. Stark gemacht!');
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_after_write_notify_trg on public.tasks;
create trigger tasks_after_write_notify_trg
  after insert or update on public.tasks
  for each row execute function public.tasks_after_write_notify();

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------
-- 10) WOCHENZIEL, WOCHEN-HISTORIE, ERFOLGE
-- ---------------------------------------------------------------------
-- 1) Erfolge: Titel, Beschreibung, Icon direkt mitspeichern
alter table public.achievements add column if not exists title text;
alter table public.achievements add column if not exists description text;
alter table public.achievements add column if not exists icon_key text;

-- Alte Schlüssel auf das neue Schema umbenennen
update public.achievements set key = 'first_weekly_goal' where key = 'weekly_goal';
update public.achievements set key = 'family_50'         where key = 'fifty_family';
update public.achievements set key = 'family_100'        where key = 'hundred_family';
update public.achievements set key = 'garden_pro'        where key = 'five_garden';

-- 2) Wochen-Historie (Montag–Sonntag), automatisch gepflegt
create table if not exists public.weekly_results (
  family_id   uuid not null references public.families(id) on delete cascade,
  week_start  date not null,             -- Montag
  done_count  integer not null default 0,
  goal        integer not null default 10,
  reached     boolean not null default false,
  reached_at  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (family_id, week_start)
);

alter table public.weekly_results enable row level security;
drop policy if exists weekly_results_select on public.weekly_results;
create policy weekly_results_select on public.weekly_results
  for select to authenticated using (family_id = public.current_family_id());
grant select on public.weekly_results to authenticated;

-- Woche einer Aufgabe neu berechnen (Berlin-Zeit)
create or replace function public.refresh_weekly_result(p_family uuid, p_when timestamptz)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  ws date := date_trunc('week', (p_when at time zone 'Europe/Berlin'))::date;
  we timestamptz := ((ws + 7)::timestamp) at time zone 'Europe/Berlin';
  wb timestamptz := (ws::timestamp) at time zone 'Europe/Berlin';
  cnt integer;
  g integer;
begin
  select count(*) into cnt from public.tasks
    where family_id = p_family and status in ('done','archived') and completed_at >= wb and completed_at < we;
  select weekly_goal into g from public.settings where family_id = p_family;
  g := coalesce(g, 10);
  insert into public.weekly_results (family_id, week_start, done_count, goal, reached, reached_at, updated_at)
  values (p_family, ws, cnt, g, cnt >= g, case when cnt >= g then now() end, now())
  on conflict (family_id, week_start) do update
    set done_count = excluded.done_count,
        goal = excluded.goal,
        reached = excluded.reached,
        reached_at = case when excluded.reached then coalesce(public.weekly_results.reached_at, now()) else null end,
        updated_at = now();
end;
$$;

create or replace function public.tasks_after_write_weekly()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.completed_at is not null then perform public.refresh_weekly_result(old.family_id, old.completed_at); end if;
    return old;
  end if;
  if new.completed_at is not null and (tg_op = 'INSERT' or new.completed_at is distinct from old.completed_at or new.status is distinct from old.status) then
    perform public.refresh_weekly_result(new.family_id, new.completed_at);
  end if;
  if tg_op = 'UPDATE' and old.completed_at is not null and new.completed_at is distinct from old.completed_at then
    perform public.refresh_weekly_result(old.family_id, old.completed_at);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_after_write_weekly_trg on public.tasks;
create trigger tasks_after_write_weekly_trg
  after insert or update or delete on public.tasks
  for each row execute function public.tasks_after_write_weekly();

-- Bestehende Wochen einmalig nachrechnen
do $$
declare r record;
begin
  for r in select distinct family_id, date_trunc('week', (completed_at at time zone 'Europe/Berlin'))::date as ws, min(completed_at) as w
           from public.tasks where completed_at is not null group by family_id, ws loop
    perform public.refresh_weekly_result(r.family_id, r.w);
  end loop;
end $$;


-- 3) Titel/Beschreibung/Icon für bereits vorhandene Erfolge nachfüllen
update public.achievements a set
  title = v.title, description = v.description, icon_key = v.icon
from (values
  ('first_done',        'Erste Aufgabe',        'Die erste Aufgabe ist geschafft.',            'check'),
  ('five_done',         '5 geschafft',          '5 Aufgaben erledigt.',                        'star'),
  ('ten_done',          '10 geschafft',         '10 Aufgaben erledigt.',                       'star'),
  ('twenty_done',       '20 geschafft',         '20 Aufgaben erledigt.',                       'star'),
  ('twentyfive_done',   '25 geschafft',         '25 Aufgaben erledigt.',                       'sparkle'),
  ('fifty_done',        '50 geschafft',         '50 Aufgaben erledigt.',                       'trophy'),
  ('five_pool',         'Ich mach das',         '5 Pool-Aufgaben übernommen.',                 'hand'),
  ('ten_pool',          'Pool-Held',            '10 Pool-Aufgaben übernommen.',                'hand'),
  ('garden_pro',        'Garten-Profi',         '5 Gartenaufgaben erledigt.',                  'leaf'),
  ('tidy_champ',        'Aufräum-Champ',        '5 Haus-&-Haushalt-Aufgaben erledigt.',        'home'),
  ('car_helper',        'Auto-Helfer',          '5 Auto-Aufgaben erledigt.',                   'car'),
  ('same_day',          'Sofort erledigt',      'Eine Aufgabe noch am selben Tag erledigt.',   'bolt'),
  ('first_weekly_goal', 'Erstes Wochenziel',    'Das erste Wochenziel ist geschafft.',         'flag'),
  ('three_weekly_goals','3 Wochenziele',        'Drei Wochenziele erreicht.',                  'trophy'),
  ('three_in_row',      '3 Wochen in Folge',    'Drei Wochenziele hintereinander erreicht.',   'trophy'),
  ('family_25',         '25 gemeinsam',         '25 Aufgaben als Familie erledigt.',           'family'),
  ('family_50',         '50 gemeinsam',         '50 Aufgaben als Familie erledigt.',           'family'),
  ('family_100',        '100 gemeinsam',        '100 Aufgaben als Familie erledigt.',          'home')
) as v(key, title, description, icon)
where a.key = v.key and a.title is null;

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'weekly_results') then
    alter publication supabase_realtime add table public.weekly_results;
  end if;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------
-- 11) HISTORIE, ARCHIV, SERIEN
-- ---------------------------------------------------------------------
-- 1) Historie: Metadaten (alte/neue Werte)
alter table public.task_activity add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists task_activity_task_idx on public.task_activity (task_id, created_at);

-- 2) Serienfelder
alter table public.tasks add column if not exists recurrence_enabled boolean not null default false;
alter table public.tasks add column if not exists series_id uuid;
alter table public.tasks add column if not exists parent_task_id uuid references public.tasks(id) on delete set null;
alter table public.tasks add column if not exists next_due_date date;
alter table public.tasks add column if not exists series_template jsonb;
create index if not exists tasks_series_idx on public.tasks (series_id);

-- Bestandsdaten: Serienfelder nachziehen
update public.tasks set recurrence_enabled = (recurrence <> 'none') where recurrence_enabled = false and recurrence <> 'none';
update public.tasks set series_id = id where series_id is null and recurrence <> 'none';

-- 3) Hilfsfunktion: nächster Termin
create or replace function public.next_due(p_due date, p_rec text, p_n integer)
returns date
language sql immutable
as $$
  select case p_rec
    when 'daily'   then greatest(coalesce(p_due, current_date), current_date) + (greatest(1, coalesce(p_n,1)) || ' days')::interval
    when 'weekly'  then greatest(coalesce(p_due, current_date), current_date) + (greatest(1, coalesce(p_n,1)) * 7 || ' days')::interval
    when 'monthly' then greatest(coalesce(p_due, current_date), current_date) + (greatest(1, coalesce(p_n,1)) || ' months')::interval
    when 'yearly'  then greatest(coalesce(p_due, current_date), current_date) + (greatest(1, coalesce(p_n,1)) || ' years')::interval
    else null end::date;
$$;

-- 6) Historie automatisch schreiben
create or replace function public.tasks_history()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fam uuid := coalesce(new.family_id, old.family_id);
  tid uuid := coalesce(new.id, old.id);
  ttl text := coalesce(new.title, old.title);
  auto_arch boolean := coalesce(current_setting('familie.auto_archive', true), '') = 'on';
  undo_series boolean := coalesce(current_setting('familie.undo_series', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
    values (fam, tid, coalesce(new.created_by, uid), 'created', ttl,
            jsonb_build_object('assignee_ids', to_jsonb(new.assignee_ids), 'is_pool', new.is_pool, 'parent_task_id', new.parent_task_id));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
    values (fam, null, uid, 'deleted', ttl,
            jsonb_build_object('task_id', old.id, 'status', old.status,
                               'reason', case when undo_series then 'undo_series' else null end,
                               'parent_task_id', old.parent_task_id));
    return old;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'done' then
      insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
      values (fam, tid, uid, 'completed', ttl, jsonb_build_object('completed_by', new.completed_by));
    elsif new.status = 'archived' then
      insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
      values (fam, tid, case when auto_arch then null else uid end, 'archived', ttl, jsonb_build_object('auto', auto_arch or uid is null));
    elsif new.status = 'claimed' and old.is_pool and not new.is_pool then
      insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
      values (fam, tid, uid, 'taken_from_pool', ttl, jsonb_build_object('assignee_ids', to_jsonb(new.assignee_ids)));
    elsif new.status in ('open','claimed') and old.status in ('done','archived') then
      insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
      values (fam, tid, uid, 'reopened', ttl,
              jsonb_build_object('from', old.status,
                                 'undo', old.status = 'done' and old.completed_at > now() - interval '10 minutes'));
    end if;
  end if;

  if new.is_pool and not old.is_pool then
    insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
    values (fam, tid, uid, 'moved_to_pool', ttl, jsonb_build_object('old_assignee_ids', to_jsonb(old.assignee_ids)));
  elsif not new.is_pool and new.assignee_ids is distinct from old.assignee_ids and not (new.status = 'claimed' and old.is_pool) then
    insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
    values (fam, tid, uid, 'assigned', ttl, jsonb_build_object('old', to_jsonb(old.assignee_ids), 'new', to_jsonb(new.assignee_ids)));
  end if;

  if new.priority is distinct from old.priority then
    insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
    values (fam, tid, uid, 'priority_changed', ttl, jsonb_build_object('old', old.priority, 'new', new.priority));
  end if;

  if new.due_date is distinct from old.due_date or new.due_kind is distinct from old.due_kind then
    insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
    values (fam, tid, uid, 'due_date_changed', ttl, jsonb_build_object('old', old.due_date, 'new', new.due_date, 'old_kind', old.due_kind, 'new_kind', new.due_kind));
  end if;

  if new.title is distinct from old.title or new.description is distinct from old.description
     or new.category is distinct from old.category or new.link is distinct from old.link
     or new.cost is distinct from old.cost or new.recurrence is distinct from old.recurrence
     or new.recurrence_interval is distinct from old.recurrence_interval
     or new.reminder_type is distinct from old.reminder_type then
    insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
    values (fam, tid, uid, 'edited', ttl, jsonb_strip_nulls(jsonb_build_object(
      'title', case when new.title is distinct from old.title then jsonb_build_object('old', old.title, 'new', new.title) end,
      'category', case when new.category is distinct from old.category then jsonb_build_object('old', old.category, 'new', new.category) end,
      'recurrence', case when new.recurrence is distinct from old.recurrence or new.recurrence_interval is distinct from old.recurrence_interval
                          then jsonb_build_object('old', old.recurrence, 'new', new.recurrence, 'old_n', old.recurrence_interval, 'new_n', new.recurrence_interval) end,
      'description_changed', (new.description is distinct from old.description))));
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_history_trg on public.tasks;
create trigger tasks_history_trg
  after insert or update or delete on public.tasks
  for each row execute function public.tasks_history();

-- Historie-Einträge durch die App selbst nicht mehr nötig; Insert bleibt für Sonderfälle erlaubt.

-- 7) Automatische Archivierung: erledigt seit 30 Tagen
create or replace function public.archive_old_tasks()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  perform set_config('familie.auto_archive', 'on', true);
  with upd as (
    update public.tasks set status = 'archived', updated_at = now()
    where status = 'done' and completed_at < now() - interval '30 days'
      and (auth.uid() is null or family_id = public.current_family_id())
    returning 1
  ) select count(*) into n from upd;
  perform set_config('familie.auto_archive', 'off', true);
  return n;
end;
$$;
grant execute on function public.archive_old_tasks() to authenticated;

-- Täglicher Lauf per pg_cron (falls im Projekt verfügbar); sonst ruft die App die Funktion beim Öffnen auf
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'familie_archive_old_tasks';
    perform cron.schedule('familie_archive_old_tasks', '15 3 * * *', 'select public.archive_old_tasks();');
  end if;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------
-- 12) EINLADUNGEN UND BEITRITT
-- ---------------------------------------------------------------------
-- 1) Familie: created_by
alter table public.families add column if not exists created_by uuid;

-- 2) Einladungen (Token wird nur als Hash gespeichert)
create table if not exists public.family_invites (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  token_hash    text not null unique,
  invited_role  text not null default 'member' check (invited_role in ('admin','member')),
  label         text,
  created_by    uuid references public.profiles(id) on delete set null,
  expires_at    timestamptz not null default now() + interval '7 days',
  used_at       timestamptz,
  used_by       uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists family_invites_family_idx on public.family_invites (family_id, created_at desc);

alter table public.family_invites enable row level security;

-- Nur Admins der eigenen Familie sehen/verwalten Einladungen (Token-Hash ist wertlos ohne Original)
drop policy if exists invites_admin_select on public.family_invites;
create policy invites_admin_select on public.family_invites
  for select to authenticated using (family_id = public.current_family_id() and public.is_admin());
drop policy if exists invites_admin_delete on public.family_invites;
create policy invites_admin_delete on public.family_invites
  for delete to authenticated using (family_id = public.current_family_id() and public.is_admin());
grant select, delete on public.family_invites to authenticated;

-- 4) Einladung erstellen (nur Admins); liefert den Klartext-Token genau einmal zurück
create or replace function public.create_invite(p_role text default 'member', p_days integer default 7, p_label text default null)
returns table (id uuid, token text, invited_role text, expires_at timestamptz)
language plpgsql security definer
set search_path = public
as $$
declare
  raw text;
  fam uuid := public.current_family_id();
  rec record;
begin
  if fam is null or not public.is_admin() then
    raise exception 'Nur Eltern (Admins) dürfen einladen';
  end if;
  if p_role not in ('admin','member') then p_role := 'member'; end if;
  raw := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.family_invites (family_id, token_hash, invited_role, label, created_by, expires_at)
  values (fam, encode(digest(raw, 'sha256'), 'hex'), p_role, p_label, auth.uid(),
          now() + make_interval(days => greatest(1, least(30, coalesce(p_days, 7)))))
  returning family_invites.id, family_invites.invited_role, family_invites.expires_at into rec;
  return query select rec.id, raw, rec.invited_role, rec.expires_at;
end;
$$;
grant execute on function public.create_invite(text, integer, text) to authenticated;

-- 5) Einladung prüfen (auch ohne Anmeldung): zeigt nur Familienname, Rolle, Gültigkeit
create or replace function public.invite_preview(p_token text)
returns table (family_name text, invited_role text, valid boolean, reason text)
language plpgsql security definer
set search_path = public
as $$
declare
  inv record;
begin
  select i.*, f.name as fname into inv
  from public.family_invites i join public.families f on f.id = i.family_id
  where i.token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
  if inv.id is null then
    return query select null::text, null::text, false, 'Einladung nicht gefunden';
  elsif inv.used_at is not null then
    return query select inv.fname, inv.invited_role, false, 'Einladung wurde bereits verwendet';
  elsif inv.expires_at < now() then
    return query select inv.fname, inv.invited_role, false, 'Einladung ist abgelaufen';
  else
    return query select inv.fname, inv.invited_role, true, null::text;
  end if;
end;
$$;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- 6) Einladung annehmen (angemeldeter Nutzer): Profil mit family_id verknüpfen, Rolle übernehmen, Einladung entwerten
create or replace function public.accept_invite(p_token text, p_display_name text default null)
returns table (family_name text, role text)
language plpgsql security definer
set search_path = public
as $$
declare
  inv record;
  uid uuid := auth.uid();
  existing record;
  fname text;
  em text;
  meta_name text;
begin
  if uid is null then raise exception 'Bitte zuerst anmelden'; end if;

  select * into inv from public.family_invites
  where token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
  for update;
  if inv.id is null then raise exception 'Einladung nicht gefunden'; end if;
  if inv.used_at is not null then raise exception 'Einladung wurde bereits verwendet'; end if;
  if inv.expires_at < now() then raise exception 'Einladung ist abgelaufen'; end if;

  select * into existing from public.profiles where id = uid;
  if existing.id is not null and existing.family_id <> inv.family_id then
    raise exception 'Dieses Konto gehört bereits zu einer anderen Familie';
  end if;

  select email, raw_user_meta_data->>'display_name' into em, meta_name from auth.users where id = uid;

  if existing.id is null then
    insert into public.profiles (id, family_id, display_name, role, avatar, color, active)
    values (uid, inv.family_id,
            coalesce(nullif(trim(p_display_name), ''), nullif(trim(meta_name), ''), initcap(split_part(coalesce(em,'Neu'), '@', 1))),
            inv.invited_role, '', 'grey', true);
  else
    update public.profiles set role = inv.invited_role, active = true,
      display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
    where id = uid;
  end if;

  update public.family_invites set used_at = now(), used_by = uid where id = inv.id;

  select name into fname from public.families where id = inv.family_id;
  return query select fname, inv.invited_role;
end;
$$;
grant execute on function public.accept_invite(text, text) to authenticated;

-- 7) Neue Familie gründen (für Konten ohne Profil)
create or replace function public.create_family(p_name text, p_display_name text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fam uuid;
  em text;
  meta_name text;
begin
  if uid is null then raise exception 'Bitte zuerst anmelden'; end if;
  if exists (select 1 from public.profiles where id = uid) then
    raise exception 'Dieses Konto gehört bereits zu einer Familie';
  end if;
  select email, raw_user_meta_data->>'display_name' into em, meta_name from auth.users where id = uid;
  insert into public.families (name, created_by) values (coalesce(nullif(trim(p_name),''), 'Unsere Familie'), uid) returning id into fam;
  -- Einstellungen (Wochenziel 10) und Standardkategorien entstehen über den families-Trigger
  insert into public.settings (family_id) values (fam) on conflict do nothing;
  insert into public.profiles (id, family_id, display_name, role, avatar, color)
  values (uid, fam, coalesce(nullif(trim(p_display_name),''), nullif(trim(meta_name),''), initcap(split_part(coalesce(em,'Ich'),'@',1))), 'admin', '', 'sage');
  return fam;
end;
$$;
grant execute on function public.create_family(text, text) to authenticated;

-- Realtime für Einladungen (Liste bei Eltern aktualisieren)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'family_invites') then
    alter publication supabase_realtime add table public.family_invites;
  end if;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------
-- 13) DATENSCHUTZ & SICHERHEIT
-- ---------------------------------------------------------------------
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


-- Familienfarben für Standard-Avatare
update public.profiles set color = 'sage' where color is null and avatar = '/avatars/papa.png';
update public.profiles set color = 'rose' where color is null and avatar = '/avatars/mama.png';
update public.profiles set color = 'pink' where color is null and avatar = '/avatars/mia.png';
update public.profiles set color = 'blue' where color is null and avatar = '/avatars/leo.png';

-- Fertig. Jetzt die vier Benutzer im Dashboard anlegen (siehe README_DE.md).
