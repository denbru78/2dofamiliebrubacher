-- =====================================================================
--  FAMILIEN-LISTE – Update: Login, Registrierung, erster Start
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================

-- Anzeigename aus der Registrierung (user_metadata.display_name) übernehmen
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
