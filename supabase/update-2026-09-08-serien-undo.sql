-- =====================================================================
--  FAMILIEN-LISTE – Update 2.17: Seed-Regel + Undo bei Serienaufgaben
--  Idempotent, migrationssicher (verändert keine bestehenden Daten).
-- =====================================================================

-- 1) Automatische Profil-Anlage ausschließlich für die vier Seed-Konten
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  fam uuid;
  seed record;
begin
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

-- 2) Undo bei Serien: beim Wieder-Öffnen die unberührte Folgeaufgabe entfernen
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

-- 3) Historie: Undo und dadurch entfernte Folgeaufgabe nachvollziehbar kennzeichnen
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
