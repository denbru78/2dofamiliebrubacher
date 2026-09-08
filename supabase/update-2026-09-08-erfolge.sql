-- =====================================================================
--  FAMILIEN-LISTE – Update: Wochenziel, Wochen-Historie, Erfolge
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================
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

