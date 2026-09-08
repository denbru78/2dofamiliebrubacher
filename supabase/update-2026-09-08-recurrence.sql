-- =====================================================================
--  FAMILIEN-LISTE – Update: erweiterte Wiederholungen (idempotent)
--  Im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================

-- Neue Spalte: Intervall (z. B. alle 2 Wochen)
alter table public.tasks
  add column if not exists recurrence_interval integer not null default 1
  check (recurrence_interval between 1 and 52);

-- Jährlich erlauben
alter table public.tasks drop constraint if exists tasks_recurrence_check;
alter table public.tasks
  add constraint tasks_recurrence_check
  check (recurrence in ('none','daily','weekly','monthly','yearly'));

-- Trigger: Mitglieder-Regeln inkl. neuer Spalte
create or replace function public.tasks_before_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  admin boolean := public.is_admin();
  sys boolean := coalesce(current_setting('familie.system_insert', true), '') = 'on';
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
      null;
    elsif old.status in ('open','claimed') and new.status = 'done'
       and uid = any(old.assignee_ids)
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

-- Trigger: nächste Aufgabe nach Erledigen (mit Intervall und jährlich)
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
