-- =====================================================================
--  FAMILIEN-LISTE – Update: Familienverwaltung, Einladungen, Beitritt
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================

create extension if not exists "pgcrypto";
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

-- 3) Automatische Profil-Anlage nur noch für bekannte Familien-Adressen (family_seed)
--    oder für den allerersten Nutzer (Bootstrap). Alle anderen treten per Einladung bei.
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
  elsif not exists (select 1 from public.profiles) then
    -- Erster Nutzer überhaupt: eigene Familie als Admin
    insert into public.families (name, created_by) values ('Unsere Familie', new.id) returning id into fam;
    insert into public.profiles (id, family_id, display_name, role, avatar, color)
    values (new.id, fam, initcap(split_part(new.email, '@', 1)), 'admin', '', 'sage')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

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

  select email into em from auth.users where id = uid;

  if existing.id is null then
    insert into public.profiles (id, family_id, display_name, role, avatar, color, active)
    values (uid, inv.family_id,
            coalesce(nullif(trim(p_display_name), ''), initcap(split_part(coalesce(em,'Neu'), '@', 1))),
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
begin
  if uid is null then raise exception 'Bitte zuerst anmelden'; end if;
  if exists (select 1 from public.profiles where id = uid) then
    raise exception 'Dieses Konto gehört bereits zu einer Familie';
  end if;
  select email into em from auth.users where id = uid;
  insert into public.families (name, created_by) values (coalesce(nullif(trim(p_name),''), 'Unsere Familie'), uid) returning id into fam;
  insert into public.profiles (id, family_id, display_name, role, avatar, color)
  values (uid, fam, coalesce(nullif(trim(p_display_name),''), initcap(split_part(coalesce(em,'Ich'),'@',1))), 'admin', '', 'sage');
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
