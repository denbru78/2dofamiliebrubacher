-- =====================================================================
--  FAMILIEN-LISTE – Update: Designsystem (Familienfarben, Icon-Familie)
--  Idempotent – im Supabase SQL-Editor einfügen und "Run" klicken.
-- =====================================================================

-- Feste Farbfamilie pro Mitglied: sage | rose | pink | blue | peach | grey
alter table public.profiles add column if not exists color text;

update public.profiles set color = 'sage' where color is null and avatar = '/avatars/papa.png';
update public.profiles set color = 'rose' where color is null and avatar = '/avatars/mama.png';
update public.profiles set color = 'pink' where color is null and avatar = '/avatars/mia.png';
update public.profiles set color = 'blue' where color is null and avatar = '/avatars/leo.png';

-- Kategorie-Icons: von Emoji auf einheitliche Icon-Schlüssel umstellen
update public.categories set icon = 'home'      where icon = '🏠';
update public.categories set icon = 'leaf'      where icon = '🌿';
update public.categories set icon = 'car'       where icon = '🚗';
update public.categories set icon = 'cart'      where icon = '🛒';
update public.categories set icon = 'search'    where icon = '🔍';
update public.categories set icon = 'family'    where icon = '👨‍👩‍👧‍👦';
update public.categories set icon = 'clipboard' where icon = '📋';
update public.categories set icon = 'sparkle'   where icon = '✨';

-- Standardkategorien für neue Familien ebenfalls mit Icon-Schlüsseln
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
    (new.id, 'Organisation', 'clipboard', 70),
    (new.id, 'Sonstiges', 'sparkle', 80)
  on conflict do nothing;
  return new;
end;
$$;
