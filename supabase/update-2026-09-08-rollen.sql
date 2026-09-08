-- =====================================================================
--  FAMILIEN-LISTE – Update: Rollenmodell V1 (Rückgängig, Deaktivieren)
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
--  Voraussetzung: das Update "Wiederholungen" wurde bereits ausgeführt.
-- =====================================================================

-- Mitglied aktiv/deaktiviert
alter table public.profiles add column if not exists active boolean not null default true;

-- Deaktivierte Nutzer sehen keine Familiendaten mehr
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

-- Eigenes Profil bleibt immer lesbar (damit die App "deaktiviert" anzeigen kann)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or family_id = public.current_family_id());

-- Mitglieder dürfen Rolle, Familie und Aktiv-Status nicht ändern; Admins nicht sich selbst deaktivieren
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

-- Aufgaben-Regeln: Kinder dürfen eigene Aufgabe 5 Minuten lang wieder öffnen
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
      null; -- Pool übernehmen
    elsif old.status in ('open','claimed') and new.status = 'done'
       and uid = any(old.assignee_ids)
       and new.assignee_ids = old.assignee_ids
       and new.is_pool = old.is_pool then
      null; -- eigene Aufgabe abhaken
    elsif old.status = 'done' and new.status in ('open','claimed')
       and old.completed_by = uid
       and old.completed_at > now() - interval '5 minutes'
       and new.assignee_ids = old.assignee_ids
       and new.is_pool = old.is_pool then
      null; -- Rückgängig innerhalb von 5 Minuten
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
