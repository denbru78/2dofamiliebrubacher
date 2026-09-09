-- =====================================================================
--  UNSER PLAN – Update V1.2: Zusatztaschengeld / Bonuspunkte
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================

-- 1) Einstellungen (Bonus ist standardmäßig AUS)
alter table public.settings add column if not exists bonus_enabled boolean not null default false;
alter table public.settings add column if not exists bonus_point_value numeric(6,2) not null default 1.00;   -- 1 Punkt = 1,00 €
alter table public.settings add column if not exists bonus_weekly_budget integer not null default 10;         -- Punkte je Kind/Woche (Hinweis für Eltern)
alter table public.settings add column if not exists bonus_hold_hours integer not null default 2;             -- Bedenkzeit im Pool

-- 2) Aufgaben: Bonusfelder
alter table public.tasks add column if not exists bonus_points integer not null default 0 check (bonus_points in (0,1,2,4,6));
alter table public.tasks add column if not exists bonus_status text not null default 'none' check (bonus_status in ('none','pending','confirmed','rejected'));
alter table public.tasks add column if not exists bonus_note text;
alter table public.tasks add column if not exists bonus_decided_by uuid references public.profiles(id) on delete set null;
alter table public.tasks add column if not exists bonus_decided_at timestamptz;
alter table public.tasks add column if not exists pool_hold_until timestamptz;       -- Bedenkzeit für Bonus-Pool-Aufgaben
alter table public.tasks add column if not exists interested_ids uuid[] not null default '{}';

-- Wechselprinzip: wer zuletzt eine Bonus-Pool-Aufgabe bekam, ist beim nächsten Mal hinten dran
alter table public.profiles add column if not exists last_bonus_pool_at timestamptz;

-- 3) Bonuskonto (Buchungen) und Auszahlungen
create table if not exists public.bonus_ledger (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete set null,
  delta       integer not null,                      -- + Gutschrift, - Auszahlung
  kind        text not null check (kind in ('earned','payout','adjust')),
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists bonus_ledger_profile_idx on public.bonus_ledger (profile_id, created_at desc);

create table if not exists public.bonus_payouts (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  points       integer not null check (points > 0),
  status       text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  requested_at timestamptz not null default now(),
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz
);

alter table public.bonus_ledger enable row level security;
alter table public.bonus_payouts enable row level security;

drop policy if exists bonus_ledger_select on public.bonus_ledger;
create policy bonus_ledger_select on public.bonus_ledger
  for select to authenticated
  using (family_id = public.current_family_id() and (profile_id = auth.uid() or public.is_admin()));
drop policy if exists bonus_ledger_admin on public.bonus_ledger;
create policy bonus_ledger_admin on public.bonus_ledger
  for insert to authenticated
  with check (family_id = public.current_family_id() and public.is_admin() and kind = 'adjust');

drop policy if exists bonus_payouts_select on public.bonus_payouts;
create policy bonus_payouts_select on public.bonus_payouts
  for select to authenticated
  using (family_id = public.current_family_id() and (profile_id = auth.uid() or public.is_admin()));

grant select, insert on public.bonus_ledger to authenticated;
grant select on public.bonus_payouts to authenticated;

-- Punktestand
create or replace function public.bonus_balance(p_profile uuid)
returns integer
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::int from public.bonus_ledger
  where profile_id = p_profile
    and family_id = public.current_family_id();
$$;
grant execute on function public.bonus_balance(uuid) to authenticated;

-- 4) Trigger-Regeln: Bonusfelder nur durch Eltern; Bedenkzeit setzen; Erledigen → "Bonus wartet"
create or replace function public.tasks_before_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  admin boolean := public.is_admin();
  sys boolean := coalesce(current_setting('familie.system_insert', true), '') = 'on';
  bonus_sys boolean := coalesce(current_setting('familie.bonus_system', true), '') = 'on';
  kids_claim boolean := coalesce((select kids_can_claim_pool from public.settings where family_id = coalesce(old.family_id, new.family_id)), true);
  hold_h integer := coalesce((select bonus_hold_hours from public.settings where family_id = coalesce(old.family_id, new.family_id)), 2);
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
    new.bonus_status := 'none';
    new.interested_ids := '{}';
    if new.is_pool and new.bonus_points > 0 then
      new.pool_hold_until := now() + make_interval(hours => greatest(0, hold_h));
    else
      new.pool_hold_until := null;
    end if;
  else
    new.updated_at := now();

    if not admin and not bonus_sys then
      if old.is_pool and old.status = 'open'
         and new.is_pool = false and new.status = 'claimed'
         and new.assignee_ids = array[uid] then
        if not kids_claim then
          raise exception 'Pool-Aufgaben dürfen aktuell nur von Eltern verteilt werden';
        end if;
        if old.bonus_points > 0 and old.pool_hold_until is not null and old.pool_hold_until > now() then
          raise exception 'Bedenkzeit läuft noch – bitte „Ich möchte“ nutzen';
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
        if old.bonus_status = 'confirmed' then
          raise exception 'Der Bonus wurde schon bestätigt – bitte Mama oder Papa fragen';
        end if;
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
         or new.bonus_points is distinct from old.bonus_points
         or new.bonus_note is distinct from old.bonus_note
         or new.bonus_decided_by is distinct from old.bonus_decided_by
         or new.pool_hold_until is distinct from old.pool_hold_until
         or new.interested_ids is distinct from old.interested_ids
         or new.created_by is distinct from old.created_by
         or new.created_at is distinct from old.created_at then
        raise exception 'Mitglieder dürfen Aufgaben nicht bearbeiten';
      end if;
      -- Bonusstatus darf ein Mitglied nie direkt setzen
      new.bonus_status := old.bonus_status;
    end if;

    if new.is_pool then
      new.assignee_ids := '{}';
    elsif array_length(new.assignee_ids, 1) is null and admin then
      new.is_pool := true;
    end if;

    -- Bedenkzeit: neu setzen, wenn eine Bonusaufgabe (wieder) in den Pool kommt
    if new.is_pool and new.bonus_points > 0 and (not old.is_pool or old.bonus_points = 0) then
      new.pool_hold_until := now() + make_interval(hours => greatest(0, hold_h));
      new.interested_ids := '{}';
    elsif not new.is_pool then
      new.pool_hold_until := null;
      new.interested_ids := '{}';
    end if;

    if new.status = 'done' and old.status <> 'done' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, uid);
      if new.bonus_points > 0 and new.bonus_status in ('none','rejected') then
        new.bonus_status := 'pending';
        new.bonus_note := null;
      end if;
    elsif new.status in ('open','claimed') and old.status in ('done','archived') then
      new.completed_at := null;
      new.completed_by := null;
      if new.bonus_status = 'pending' then new.bonus_status := 'none'; end if;
    end if;
    if new.bonus_points = 0 then new.bonus_status := 'none'; end if;
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
    if new.series_template is null
       or (tg_op = 'UPDATE' and (new.recurrence is distinct from old.recurrence or new.recurrence_interval is distinct from old.recurrence_interval)) then
      new.series_template := jsonb_build_object(
        'title', new.title, 'description', new.description, 'link', new.link, 'cost', new.cost,
        'category', new.category, 'priority', new.priority, 'assignee_ids', to_jsonb(new.assignee_ids),
        'is_pool', new.is_pool, 'recurrence', new.recurrence, 'recurrence_interval', new.recurrence_interval,
        'reminder_type', case when new.reminder_type = 'custom' then 'none' else new.reminder_type end,
        'bonus_points', new.bonus_points);
    end if;
  else
    new.next_due_date := null;
    new.series_template := null;
  end if;

  return new;
end;
$$;

-- Folgeaufgaben übernehmen den Bonus
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
  if new.status = 'done' and old.status <> 'done' and new.recurrence_enabled and new.recurrence <> 'none' then
    t := coalesce(new.series_template, '{}'::jsonb);
    select coalesce(array_agg(x::uuid), '{}') into ids from jsonb_array_elements_text(coalesce(t->'assignee_ids', to_jsonb(new.assignee_ids))) as x;
    next_date := public.next_due(new.due_date, new.recurrence, new.recurrence_interval);
    perform set_config('familie.system_insert', 'on', true);
    insert into public.tasks (family_id, title, description, link, cost, category, priority,
                              due_kind, due_date, assignee_ids, is_pool, status, recurrence, recurrence_interval,
                              created_by, reminder_type, series_id, parent_task_id, series_template, bonus_points)
    values (new.family_id,
            coalesce(t->>'title', new.title), coalesce(t->>'description', new.description),
            coalesce(t->>'link', new.link), coalesce((t->>'cost')::numeric, new.cost),
            coalesce(t->>'category', new.category), coalesce(t->>'priority', new.priority),
            'date', next_date, ids, coalesce((t->>'is_pool')::boolean, new.is_pool), 'open',
            new.recurrence, new.recurrence_interval, new.created_by,
            coalesce(t->>'reminder_type', 'none'),
            coalesce(new.series_id, new.id), new.id, t,
            coalesce((t->>'bonus_points')::int, new.bonus_points));
    perform set_config('familie.system_insert', 'off', true);
  end if;

  if old.status = 'done' and new.status in ('open','claimed') and new.recurrence <> 'none' then
    for f in
      select * from public.tasks
      where parent_task_id = new.id and status = 'open' and completed_at is null
        and updated_at = created_at
        and not exists (select 1 from public.task_activity a where a.task_id = tasks.id and a.action <> 'created')
    loop
      perform set_config('familie.undo_series', 'on', true);
      delete from public.tasks where id = f.id;
      perform set_config('familie.undo_series', 'off', true);
    end loop;
  end if;
  return new;
end;
$$;

-- 5) Mitteilungen: Bonus wartet auf Bestätigung (an Eltern), gebündelt pro Aufgabe
create or replace function public.bonus_notify_pending()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  who text := coalesce((select display_name from public.profiles where id = new.completed_by), 'Jemand');
  a record;
begin
  if new.bonus_status = 'pending' and old.bonus_status is distinct from 'pending' then
    for a in select id from public.profiles where family_id = new.family_id and role = 'admin' and active loop
      insert into public.notifications (family_id, profile_id, type, title, body, task_id)
      values (new.family_id, a.id, 'bonus_pending', 'Bonus bestätigen?', who || ' hat „' || new.title || '“ erledigt – ' || new.bonus_points || ' Punkte warten auf dein Okay.', new.id);
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists bonus_notify_pending_trg on public.tasks;
create trigger bonus_notify_pending_trg
  after update on public.tasks
  for each row execute function public.bonus_notify_pending();

-- 6) Bonus bestätigen / ablehnen (nur Eltern)
create or replace function public.bonus_decide(p_task uuid, p_ok boolean, p_note text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  t record;
  uid uuid := auth.uid();
  kid uuid;
begin
  if not public.is_admin() then raise exception 'Nur Eltern (Admins) dürfen den Bonus bestätigen'; end if;
  select * into t from public.tasks where id = p_task and family_id = public.current_family_id() for update;
  if t.id is null then raise exception 'Aufgabe nicht gefunden'; end if;
  if t.bonus_status <> 'pending' then raise exception 'Für diese Aufgabe wartet kein Bonus'; end if;
  kid := t.completed_by;
  perform set_config('familie.bonus_system', 'on', true);
  if p_ok then
    update public.tasks set bonus_status = 'confirmed', bonus_decided_by = uid, bonus_decided_at = now(), bonus_note = null where id = p_task;
    if kid is not null then
      insert into public.bonus_ledger (family_id, profile_id, task_id, delta, kind, note, created_by)
      values (t.family_id, kid, t.id, t.bonus_points, 'earned', t.title, uid);
      insert into public.notifications (family_id, profile_id, type, title, body, task_id)
      values (t.family_id, kid, 'bonus_confirmed', '+' || t.bonus_points || ' Punkte', '„' || t.title || '“ wurde bestätigt. Stark!', t.id);
    end if;
  else
    -- Ablehnung: Aufgabe geht mit Hinweis zurück auf offen
    update public.tasks set bonus_status = 'rejected', bonus_decided_by = uid, bonus_decided_at = now(),
      bonus_note = nullif(trim(p_note), ''), status = case when t.is_pool then 'open' else 'claimed' end
      where id = p_task;
    if kid is not null then
      insert into public.notifications (family_id, profile_id, type, title, body, task_id)
      values (t.family_id, kid, 'bonus_rejected', 'Noch nicht ganz', '„' || t.title || '“: ' || coalesce(nullif(trim(p_note), ''), 'Bitte noch einmal nachsehen.'), t.id);
    end if;
  end if;
  perform set_config('familie.bonus_system', 'off', true);
end;
$$;
grant execute on function public.bonus_decide(uuid, boolean, text) to authenticated;

-- 7) Interesse an Bonus-Pool-Aufgabe (Bedenkzeit) und Auflösung mit Wechselprinzip
create or replace function public.bonus_interest(p_task uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  t record;
  uid uuid := auth.uid();
begin
  select * into t from public.tasks where id = p_task and family_id = public.current_family_id() for update;
  if t.id is null or not t.is_pool or t.bonus_points = 0 then raise exception 'Keine Bonus-Pool-Aufgabe'; end if;
  perform set_config('familie.bonus_system', 'on', true);
  if uid = any(t.interested_ids) then
    update public.tasks set interested_ids = array_remove(interested_ids, uid) where id = p_task;
  else
    update public.tasks set interested_ids = array_append(interested_ids, uid) where id = p_task;
  end if;
  perform set_config('familie.bonus_system', 'off', true);
end;
$$;
grant execute on function public.bonus_interest(uuid) to authenticated;

create or replace function public.resolve_pool_holds()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  t record;
  winner uuid;
  n integer := 0;
begin
  perform set_config('familie.bonus_system', 'on', true);
  for t in
    select * from public.tasks
    where family_id = public.current_family_id() and is_pool and status = 'open' and bonus_points > 0
      and pool_hold_until is not null and pool_hold_until <= now()
    for update
  loop
    if array_length(t.interested_ids, 1) is null then
      -- niemand interessiert: Bedenkzeit beenden, normales Übernehmen möglich
      update public.tasks set pool_hold_until = null where id = t.id;
    else
      -- Wechselprinzip: wer am längsten keine Bonus-Pool-Aufgabe bekam, ist dran
      select p.id into winner from public.profiles p
      where p.id = any(t.interested_ids) and p.active
      order by p.last_bonus_pool_at nulls first, p.created_at
      limit 1;
      if winner is not null then
        update public.tasks set is_pool = false, assignee_ids = array[winner], status = 'claimed', pool_hold_until = null, interested_ids = '{}'
        where id = t.id;
        update public.profiles set last_bonus_pool_at = now() where id = winner;
        insert into public.notifications (family_id, profile_id, type, title, body, task_id)
        values (t.family_id, winner, 'assigned', 'Bonusaufgabe ist deine', '„' || t.title || '“ (' || t.bonus_points || ' Punkte) gehört jetzt dir.', t.id);
        n := n + 1;
      else
        update public.tasks set pool_hold_until = null where id = t.id;
      end if;
    end if;
  end loop;
  perform set_config('familie.bonus_system', 'off', true);
  return n;
end;
$$;
grant execute on function public.resolve_pool_holds() to authenticated;

-- 8) Auszahlung: Kind fordert an, Eltern bestätigen
create or replace function public.bonus_payout_request(p_points integer)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fam uuid := public.current_family_id();
  bal integer := public.bonus_balance(uid);
  pending integer := coalesce((select sum(points) from public.bonus_payouts where profile_id = uid and status = 'pending'), 0);
  pid uuid;
  a record;
  who text := coalesce((select display_name from public.profiles where id = uid), 'Jemand');
  val numeric := coalesce((select bonus_point_value from public.settings where family_id = fam), 1);
begin
  if p_points is null or p_points <= 0 then raise exception 'Bitte eine Punktzahl wählen'; end if;
  if p_points > bal - pending then raise exception 'So viele Punkte sind nicht verfügbar'; end if;
  insert into public.bonus_payouts (family_id, profile_id, points) values (fam, uid, p_points) returning id into pid;
  for a in select id from public.profiles where family_id = fam and role = 'admin' and active loop
    insert into public.notifications (family_id, profile_id, type, title, body)
    values (fam, a.id, 'payout_request', 'Auszahlung gewünscht', who || ' möchte ' || p_points || ' Punkte (' || to_char(p_points * val, 'FM999990.00') || ' €) auszahlen lassen.');
  end loop;
  return pid;
end;
$$;
grant execute on function public.bonus_payout_request(integer) to authenticated;

create or replace function public.bonus_payout_decide(p_payout uuid, p_ok boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  uid uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'Nur Eltern (Admins) dürfen Auszahlungen bestätigen'; end if;
  select * into r from public.bonus_payouts where id = p_payout and family_id = public.current_family_id() for update;
  if r.id is null or r.status <> 'pending' then raise exception 'Auszahlung nicht gefunden'; end if;
  if p_ok then
    update public.bonus_payouts set status = 'confirmed', decided_by = uid, decided_at = now() where id = p_payout;
    insert into public.bonus_ledger (family_id, profile_id, delta, kind, note, created_by)
    values (r.family_id, r.profile_id, -r.points, 'payout', 'Auszahlung', uid);
    insert into public.notifications (family_id, profile_id, type, title, body)
    values (r.family_id, r.profile_id, 'payout_done', 'Ausgezahlt', r.points || ' Punkte wurden ausgezahlt.');
  else
    update public.bonus_payouts set status = 'rejected', decided_by = uid, decided_at = now() where id = p_payout;
    insert into public.notifications (family_id, profile_id, type, title, body)
    values (r.family_id, r.profile_id, 'payout_rejected', 'Auszahlung später', 'Die Auszahlung von ' || r.points || ' Punkten wurde noch nicht freigegeben. Sprich mit Mama oder Papa.');
  end if;
end;
$$;
grant execute on function public.bonus_payout_decide(uuid, boolean) to authenticated;

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bonus_ledger') then
    alter publication supabase_realtime add table public.bonus_ledger;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bonus_payouts') then
    alter publication supabase_realtime add table public.bonus_payouts;
  end if;
exception when others then null;
end $$;
