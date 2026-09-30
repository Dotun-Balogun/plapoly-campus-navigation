# PLAPOLYNAV — Supabase setup

The app reads only from your own Supabase project. Until it is connected, live data stays empty; the public map's optional sample preview is temporary and never writes to Supabase.

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and create a new project.
2. Open **Settings → API** and copy:
   - Project URL → `VITE_APP_SUPABASE_URL`
   - Publishable key (`sb_publishable_…`) → `VITE_APP_SUPABASE_PUBLISHABLE_KEY`

## 2. Configure the app

```bash
cp .env.example .env
# paste your values into .env
pnpm install
pnpm dev
```

## 3. Run the database migration

Option A — dashboard (easiest):

1. Open **SQL Editor → New query**.
2. Paste the whole contents of `supabase/migrations/0001_plapolynav_init.sql`, click **Run**.
3. New query again, paste `supabase/migrations/0002_schools_and_storage.sql`, click **Run**. This adds the School→Department link and the `location-images` storage bucket the admin photo upload needs.

Option B — Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The migration creates:

| Table        | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| `locations`  | Campus places (name, category, building, floor, lat/lng, image) |
| `nav_nodes`  | Walkable graph points                                           |
| `nav_edges`  | Connections between nodes (distance, accessible, has_stairs)    |
| `profiles`   | One row per auth user                                           |
| `user_roles` | Roles (`admin`, `user`) stored separately from profiles         |

It also enables RLS with public (anonymous) read access to campus data,
admin-only writes via the `has_role(auth.uid(), 'admin')` security-definer
function and owner-only profiles. The migration leaves every campus-data table empty.

To load or customise the initial data yourself, edit and run
`supabase/seed.sql` (format documented at the top of that file). It is
idempotent — safe to re-run.

## 4. Make yourself an admin

1. Create a user in **Authentication → Users**. The app provides sign-in only.
2. In the SQL editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com'
on conflict do nothing;
```

## 5. Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Add `VITE_APP_SUPABASE_URL` and `VITE_APP_SUPABASE_PUBLISHABLE_KEY` as environment variables.
3. Build command `pnpm build`, output is handled by the TanStack Start preset.

## Editing campus data

Sign in at `/admin`. After assigning that account the `admin` role with the SQL above,
the dashboard can add, edit and delete locations, nodes and route connections.

## Seed format (adding your own data)

Everything below goes in the SQL editor (or edit the seed section at the
bottom of `supabase/migrations/0001_plapolynav_init.sql` before running it).

**Locations** — one row per campus place:

```sql
insert into public.locations (name, description, category, building, floor, latitude, longitude)
values
  ('School of ICT', 'Computer Science and related departments.', 'school', 'ICT Building', 'ground', 9.5340, 8.9016),
  ('Library', 'Central campus library.', 'facility', 'Library Building', 'ground', 9.5344, 8.8978);
```

**Navigation nodes** — the walkable points routes are calculated over:

```sql
insert into public.nav_nodes (name, latitude, longitude, type)
values
  ('Main Gate', 9.5322, 8.8992, 'entrance'),
  ('Central Junction', 9.5334, 8.9000, 'junction');
```

**Navigation edges** — connections between nodes (distance is in metres;
the app routes in both directions from a single row):

```sql
insert into public.nav_edges (from_node, to_node, distance, accessible, has_stairs)
select a.id, b.id, 120, true, false
from public.nav_nodes a, public.nav_nodes b
where a.name = 'Main Gate' and b.name = 'Central Junction';
```

Rules of thumb:

- Edge node names must exactly match names in `nav_nodes`.
- Latitude/longitude are decimal degrees (e.g. from Google Maps right-click).
- `category` and `type` are free text — the app groups/filters by them.
- `accessible` / `has_stairs` default to `true` / `false` and can be omitted.
