-- =====================================================================
--  UNSER PLAN – Update V1.1: Regelbasierte Schnelleingabe + Kategorie Schule
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================

-- 1) Neue Kategorie "Schule" für alle bestehenden Familien (zwischen Familie & Kinder und Organisation)
insert into public.categories (family_id, name, icon, sort_order)
select f.id, 'Schule', 'book', 65 from public.families f
on conflict (family_id, name) do nothing;

-- Neue Familien bekommen Schule automatisch
create or replace function public.families_after_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.settings (family_id) values (new.id) on conflict do nothing;
  insert into public.categories (family_id, name, icon, sort_order) values
    (new.id, 'Haus & Haushalt', 'home', 10),
    (new.id, 'Garten', 'leaf', 20),
    (new.id, 'Auto & Mobilität', 'car', 30),
    (new.id, 'Besorgen & Kaufen', 'cart', 40),
    (new.id, 'Prüfen & Recherchieren', 'search', 50),
    (new.id, 'Familie & Kinder', 'family', 60),
    (new.id, 'Schule', 'book', 65),
    (new.id, 'Organisation', 'clipboard', 70),
    (new.id, 'Sonstiges', 'sparkle', 80)
  on conflict do nothing;
  return new;
end;
$$;

-- 2) Familieneigene Stichwörter für die Schnelleingabe (Ergänzung zur eingebauten Wortliste)
--    type: 'person' (value = profile_id) | 'category' (value = Kategoriename)
create table if not exists public.quick_keywords (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  word        text not null check (char_length(trim(word)) between 2 and 40),
  type        text not null check (type in ('person','category')),
  value       text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (family_id, word, type)
);
create index if not exists quick_keywords_family_idx on public.quick_keywords (family_id);

alter table public.quick_keywords enable row level security;

drop policy if exists quick_keywords_select on public.quick_keywords;
create policy quick_keywords_select on public.quick_keywords
  for select to authenticated using (family_id = public.current_family_id());

drop policy if exists quick_keywords_admin_write on public.quick_keywords;
create policy quick_keywords_admin_write on public.quick_keywords
  for all to authenticated
  using (family_id = public.current_family_id() and public.is_admin())
  with check (family_id = public.current_family_id() and public.is_admin());

grant select, insert, update, delete on public.quick_keywords to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quick_keywords') then
    alter publication supabase_realtime add table public.quick_keywords;
  end if;
exception when others then null;
end $$;
