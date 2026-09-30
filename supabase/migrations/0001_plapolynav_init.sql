-- ============================================================
-- PLAPOLYNAV — initial schema and security policies
-- Run this file in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Roles ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'user');
  end if;
end
$$;

-- ---------- Tables ----------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'other',
  building text,
  floor text,
  latitude double precision not null,
  longitude double precision not null,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nav_nodes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  floor text default 'ground',
  type text not null default 'junction',
  created_at timestamptz not null default now()
);

create table if not exists public.nav_edges (
  id uuid primary key default gen_random_uuid(),
  from_node uuid not null references public.nav_nodes(id) on delete cascade,
  to_node uuid not null references public.nav_nodes(id) on delete cascade,
  distance double precision not null default 1,
  accessible boolean not null default true,
  has_stairs boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists locations_category_idx on public.locations (category);
create index if not exists nav_edges_from_idx on public.nav_edges (from_node);
create index if not exists nav_edges_to_idx on public.nav_edges (to_node);

-- ---------- Grants (PostgREST needs these in addition to RLS) ----------
grant select on public.locations to anon;
grant select on public.nav_nodes to anon;
grant select on public.nav_edges to anon;
grant select, insert, update, delete on public.locations to authenticated;
grant select, insert, update, delete on public.nav_nodes to authenticated;
grant select, insert, update, delete on public.nav_edges to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant all on public.locations, public.nav_nodes, public.nav_edges,
             public.profiles, public.user_roles to service_role;

-- ---------- Role helper (security definer avoids recursive RLS) ----------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- ---------- Row Level Security ----------
alter table public.locations  enable row level security;
alter table public.nav_nodes  enable row level security;
alter table public.nav_edges  enable row level security;
alter table public.profiles   enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "public read locations" on public.locations;
create policy "public read locations" on public.locations
  for select to anon, authenticated using (true);

drop policy if exists "admins write locations" on public.locations;
create policy "admins write locations" on public.locations
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "public read nodes" on public.nav_nodes;
create policy "public read nodes" on public.nav_nodes
  for select to anon, authenticated using (true);

drop policy if exists "admins write nodes" on public.nav_nodes;
create policy "admins write nodes" on public.nav_nodes
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "public read edges" on public.nav_edges;
create policy "public read edges" on public.nav_edges
  for select to anon, authenticated using (true);

drop policy if exists "admins write edges" on public.nav_edges;
create policy "admins write edges" on public.nav_edges
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "own profile write" on public.profiles;
create policy "own profile write" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "own roles read" on public.user_roles;
create policy "own roles read" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

-- ---------- Keep updated_at fresh ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

-- ---------- Create a profile row for every new auth user ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
