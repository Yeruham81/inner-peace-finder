/**
 * Phase Q1 v4 — server-side catalog loader for the query interpreter.
 * Cached in-process with a TTL. Server-only; never import from client code.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { applyEligibility } from "./search-eligibility";
import { buildSearchCatalog, CITY_ALIASES } from "./catalog-builder";
import type { Catalog } from "./query-interpreter.types";

const TTL_MS = 60_000;
let cache: { at: number; catalog: Catalog; hideUnclaimedAfterFirstLead: boolean } | null = null;

export { CITY_ALIASES };

async function serverClient(): Promise<SupabaseClient<Database>> {
  // Server-only trusted read client; `anon` cannot read public.therapists.
  const { trustedReadClient } = await import("./trusted-read-client.server");
  return trustedReadClient();
}

/**
 * `client` is an injection seam used by the production-path regression
 * tests. Production callers pass the request-scoped server client so the
 * catalog and the search share one connection.
 */
export async function loadSearchCatalog(
  client?: SupabaseClient<Database>,
  options: { hideUnclaimedAfterFirstLead?: boolean } = {},
): Promise<Catalog> {
  const now = Date.now();
  const hideUnclaimedAfterFirstLead = options.hideUnclaimedAfterFirstLead ?? true;
  if (cache && cache.hideUnclaimedAfterFirstLead === hideUnclaimedAfterFirstLead && now - cache.at < TTL_MS) {
    return cache.catalog;
  }

  const sb = client ?? (await serverClient());

  const cityQ = applyEligibility(
    sb
      .from("therapist_locations")
      .select("city, therapists!inner(id, is_active, profile_status, visibility)")
      .eq("is_active", true),
    "therapists!inner",
    { hideUnclaimedAfterFirstLead },
  );
  const nameQ = applyEligibility(sb.from("therapists").select("id, full_name"), "therapists", {
    hideUnclaimedAfterFirstLead,
  });

  const [profRes, modRes, popRes, langRes, cityRes, nameRes] = await Promise.all([
    sb.from("professions").select("id, slug, name_he, name_en").eq("is_active", true),
    sb.from("treatment_modalities").select("id, slug, name_he, name_en").eq("is_active", true),
    sb.from("population_groups").select("id, slug, name"),
    sb.from("languages").select("id, code, name"),
    cityQ as unknown as Promise<{ data: Array<{ city: string | null }> | null; error: unknown }>,
    nameQ as unknown as Promise<{
      data: Array<{ id: string; full_name: string }> | null;
      error: unknown;
    }>,
  ]);
  // Fail loudly rather than silently returning an empty catalog.
  for (const r of [profRes, modRes, popRes, langRes, cityRes, nameRes]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = (r as any).error;
    if (err) throw err;
  }

  const catalog = buildSearchCatalog({
    professions: profRes.data ?? [],
    modalities: modRes.data ?? [],
    populations: (popRes.data ?? []) as Array<{ slug: string; name: string }>,
    languages: (langRes.data ?? []) as Array<{ code: string; name: string }>,
    cities: (cityRes.data ?? []) as Array<{ city: string | null }>,
    therapistNames: (nameRes.data ?? []) as Array<{ id: string; full_name: string }>,
  });
  cache = { at: now, catalog, hideUnclaimedAfterFirstLead };
  return catalog;
}

export function __resetCatalogCache(): void {
  cache = null;
}
