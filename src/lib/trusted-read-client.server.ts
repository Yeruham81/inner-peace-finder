/**
 * Server-only trusted read client for PUBLIC therapist reads.
 *
 * Anonymous visitors have no direct Data API privileges on
 * `public.therapists` (see the permissions migration). Public directory,
 * search and profile reads therefore run inside trusted TanStack server
 * functions through this module, which reuses the existing privileged
 * server client.
 *
 * Because this client bypasses RLS, every therapist query built on top of
 * it MUST still route through `applyEligibility()` and MUST return an
 * explicit safe DTO — never a raw row, never `select("*")`.
 *
 * The `.server.ts` filename keeps it out of every client bundle. Import it
 * with a dynamic `await import()` from `*.functions.ts` modules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export function trustedReadClient(): SupabaseClient<Database> {
  return supabaseAdmin as unknown as SupabaseClient<Database>;
}
