-- ============================================================
-- PLAPOLYNAV — School → Department relationship + image storage
-- Run this file after 0001_plapolynav_init.sql.
-- ============================================================

-- ---------- School → Department ----------
-- A location with parent_id set is a Department/unit that belongs to the
-- School (or any other location) with that id. Top-level Schools, and every
-- location that doesn't need this (library, cafeteria, gate, ...), simply
-- leave parent_id null — nothing about them changes.
alter table public.locations
  add column if not exists parent_id uuid references public.locations(id) on delete set null;

create index if not exists locations_parent_idx on public.locations (parent_id);

-- ---------- Image storage ----------
-- Bucket for admin-uploaded location photos, so the admin screen can upload
-- a file instead of pasting a URL. Public read (photos are shown to every
-- visitor), admin-only write.
insert into storage.buckets (id, name, public)
values ('location-images', 'location-images', true)
on conflict (id) do nothing;

drop policy if exists "public read location images" on storage.objects;
create policy "public read location images" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'location-images');

drop policy if exists "admins upload location images" on storage.objects;
create policy "admins upload location images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'location-images' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins update location images" on storage.objects;
create policy "admins update location images" on storage.objects
  for update to authenticated
  using (bucket_id = 'location-images' and public.has_role(auth.uid(), 'admin'))
  with check (bucket_id = 'location-images' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins delete location images" on storage.objects;
create policy "admins delete location images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'location-images' and public.has_role(auth.uid(), 'admin'));
