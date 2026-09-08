-- =====================================================================
--  FAMILIEN-LISTE – Update: Historie, Archiv, Serien
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================

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

-- 4) Before-Trigger: Regeln + Serienfelder + Erinnerung
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

-- 5) Folgeaufgabe nach Erledigen (aus der Serienvorlage; alte Aufgabe bleibt erhalten)
create or replace function public.tasks_after_done()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  t jsonb;
  ids uuid[];
  next_date date;
begin
  if new.status = 'done' and old.status <> 'done' and new.recurrence_enabled and new.recurrence <> 'none' then
    t := coalesce(new.series_template, '{}'::jsonb);
    select coalesce(array_agg(x::uuid), '{}') into ids from jsonb_array_elements_text(coalesce(t->'assignee_ids', to_jsonb(new.assignee_ids))) as x;
    next_date := public.next_due(new.due_date, new.recurrence, new.recurrence_interval);
    perform set_config('familie.system_insert', 'on', true);
    insert into public.tasks (family_id, title, description, link, cost, category, priority,
                              due_kind, due_date, assignee_ids, is_pool, status, recurrence, recurrence_interval,
                              created_by, reminder_type, series_id, parent_task_id, series_template)
    values (new.family_id,
            coalesce(t->>'title', new.title),
            coalesce(t->>'description', new.description),
            coalesce(t->>'link', new.link),
            coalesce((t->>'cost')::numeric, new.cost),
            coalesce(t->>'category', new.category),
            coalesce(t->>'priority', new.priority),
            'date', next_date, ids, coalesce((t->>'is_pool')::boolean, new.is_pool), 'open',
            new.recurrence, new.recurrence_interval, new.created_by,
            coalesce(t->>'reminder_type', 'none'),
            coalesce(new.series_id, new.id), new.id, t);
    perform set_config('familie.system_insert', 'off', true);
  end if;
  return new;
end;
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
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
    values (fam, tid, coalesce(new.created_by, uid), 'created', ttl,
            jsonb_build_object('assignee_ids', to_jsonb(new.assignee_ids), 'is_pool', new.is_pool, 'parent_task_id', new.parent_task_id));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
    values (fam, null, uid, 'deleted', ttl, jsonb_build_object('task_id', old.id, 'status', old.status));
    return old;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if new.status = 'done' then
      insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
      values (fam, tid, uid, 'completed', ttl, jsonb_build_object('completed_by', new.completed_by));
    elsif new.status = 'archived' then
      insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
      values (fam, tid, uid, 'archived', ttl, jsonb_build_object('auto', uid is null));
    elsif new.status = 'claimed' and old.is_pool and not new.is_pool then
      insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
      values (fam, tid, uid, 'taken_from_pool', ttl, jsonb_build_object('assignee_ids', to_jsonb(new.assignee_ids)));
    elsif new.status in ('open','claimed') and old.status in ('done','archived') then
      insert into public.task_activity (family_id, task_id, actor_id, action, task_title, metadata)
      values (fam, tid, uid, 'reopened', ttl, jsonb_build_object('from', old.status));
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
      'description_changed', (new.description is distinct from old.description),
      'series_scope', current_setting('familie.series_scope', true))));
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
  with upd as (
    update public.tasks set status = 'archived', updated_at = now()
    where status = 'done' and completed_at < now() - interval '30 days'
      and (auth.uid() is null or family_id = public.current_family_id())
    returning 1
  ) select count(*) into n from upd;
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
