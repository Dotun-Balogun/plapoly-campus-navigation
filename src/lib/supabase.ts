import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * BRING YOUR OWN SUPABASE
 *
 * This app talks only to the Supabase project you configure yourself.
 * Deliberately uses its own env var names (prefixed `VITE_APP_`) so that no
 * externally injected/managed Supabase credentials can ever be picked up.
 *
 * Create a `.env` file (see `.env.example`) with:
 *
 *   VITE_APP_SUPABASE_URL=https://<your-project-ref>.supabase.co
 *   VITE_APP_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
 *
 * Until these are set the live data views remain empty. The public map offers
 * an isolated visual preview that never writes sample rows to the database.
 */
const url = import.meta.env['VITE_APP_SUPABASE_URL'] as string | undefined;
const publishableKey = import.meta.env['VITE_APP_SUPABASE_PUBLISHABLE_KEY'] as string | undefined;

export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = url && publishableKey
  ? createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_APP_SUPABASE_URL and VITE_APP_SUPABASE_PUBLISHABLE_KEY to your .env file.",
    );
  }
  return supabase;
}
