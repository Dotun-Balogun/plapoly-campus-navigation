# PLAPOLYNAV

Campus navigation for Plateau State Polytechnic, Barkin Ladi. The public map supports place search, destination photos and walking routes. `/admin` is a sign-in-only dashboard for managing locations, route nodes and connections.

## Personal Supabase setup

1. Copy `.env.example` to `.env`.
2. Add `VITE_APP_SUPABASE_URL` and `VITE_APP_SUPABASE_PUBLISHABLE_KEY` from your own Supabase project.
3. Apply `supabase/migrations/0001_plapolynav_init.sql`.
4. Create the administrator in Supabase Auth and assign its `admin` role using `SUPABASE_SETUP.md`.

The live campus tables start empty. The first-visit sample tour is local preview content and is never saved to Supabase.