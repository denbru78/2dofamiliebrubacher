-- =====================================================================
--  FAMILIEN-LISTE – Update: Korrekturen aus dem V1-Abnahmecheck
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================

-- 1) Automatische Archivierung in der Historie als "automatisch" kennzeichnen
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
      'description_changed', (new.description is distinct from old.description))));
  end if;

  return new;
end;
$$;

-- 2) Folgeaufgaben einer Serie lösen keine "Neue Aufgabe für dich"-Mitteilung aus (keine Flut)
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
