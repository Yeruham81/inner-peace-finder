/**
 * Profile → semantic source-of-truth synchronization.
 *
 * `therapists.semantic_profile` is the ONLY semantic source Unified Search
 * reads (via `parseStoredProfile` + `SemanticEngine.scoreProfiles`). This
 * module is the single place that recomputes it when a therapist saves or
 * publishes a profile.
 *
 * Hard rules:
 *  - Extraction is delegated to the existing `SemanticEngine.extractProfile`.
 *    No second extraction algorithm, no LLM, no client-supplied slugs.
 *  - The stored value always conforms to the canonical contract
 *    `Array<{ slug: string; weight: number }>` (via `serializeProfile`).
 *  - Catalog / extraction failures propagate. A DB failure must never be
 *    silently converted into `[]` — that would publish a profile with an
 *    outdated (or wiped) semantic profile.
 *  - A legitimately empty extraction result is NOT an error: the profile can
 *    still be found through profession, location and other explicit filters.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SemanticEngine } from "./semantic-engine";
import { serializeProfile, type SemanticProfileEntry } from "./therapist-semantic-profile";

/** Active canonical slugs — extraction output is validated against these. */
async function loadActiveSlugs(sb: SupabaseClient<Database>): Promise<Set<string>> {
  const { data, error } = await sb.from("problems").select("slug").eq("is_active", true);
  if (error) throw error;
  const out = new Set<string>();
  for (const row of data ?? []) {
    const slug = (row as { slug?: unknown }).slug;
    if (typeof slug === "string" && slug.length > 0) out.add(slug);
  }
  return out;
}

/**
 * Recompute the canonical semantic profile for a therapist description.
 * Returns `[]` when the description is empty or yields no canonical domain —
 * which intentionally CLEARS an outdated value.
 */
export async function computeSemanticProfile(
  fullDescription: string | null | undefined,
  sb: SupabaseClient<Database>,
): Promise<SemanticProfileEntry[]> {
  const description = (fullDescription ?? "").trim();
  if (description.length === 0) return [];

  // Both reads may throw — deliberately not caught here.
  const [activeSlugs, extracted] = await Promise.all([
    loadActiveSlugs(sb),
    SemanticEngine.extractProfile(description, sb),
  ]);

  return serializeProfile(extracted).filter((entry) => activeSlugs.has(entry.slug));
}
