-- =====================================================================
--  FAMILIEN-LISTE – Update: Fälligkeiten, Erinnerungen, Mitteilungen
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
--  Voraussetzung: alle bisherigen Updates wurden ausgeführt.
-- =====================================================================

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

-- 6) Trigger: Regeln + reminder_at berechnen (Berlin-Zeit, 08:00 Uhr)
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

  -- Erinnerungszeitpunkt aus Art + Fälligkeit ableiten
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
  -- 'custom': reminder_at bleibt wie übergeben

  return new;
end;
$$;

-- Wiederholung: Erinnerungsart mitnehmen
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
                              due_kind, due_date, assignee_ids, is_pool, status, recurrence, recurrence_interval, created_by,
                              reminder_type)
    values (new.family_id, new.title, new.description, new.link, new.cost, new.category, new.priority,
            'date', next_date, new.assignee_ids, new.is_pool, 'open', new.recurrence, n, new.created_by,
            case when new.reminder_type = 'custom' then 'none' else new.reminder_type end);
    perform set_config('familie.system_insert', 'off', true);
  end if;
  return new;
end;
$$;

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
begin
  -- Neue Zuweisung (Person war vorher nicht zuständig)
  if not new.is_pool and new.status in ('open','claimed') then
    foreach pid in array new.assignee_ids loop
      if pid <> coalesce(uid, '00000000-0000-0000-0000-000000000000'::uuid)
         and (tg_op = 'INSERT' or not (pid = any(old.assignee_ids))) then
        insert into public.notifications (family_id, profile_id, type, title, body, task_id)
        values (new.family_id, pid, 'assigned', 'Neue Aufgabe für dich', actor_name || ' hat dir „' || new.title || '“ zugewiesen.', new.id);
      end if;
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    -- Pool-Aufgabe übernommen → Familie
    if old.is_pool and not new.is_pool and new.status = 'claimed' then
      insert into public.notifications (family_id, profile_id, type, title, body, task_id)
      values (new.family_id, null, 'claimed', 'Pool-Aufgabe übernommen', actor_name || ' übernimmt „' || new.title || '“.', new.id);
    end if;

    -- Wochenziel genau erreicht → Familie (einmal pro Woche)
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
