/**
 * Therapist Semantic Profile
 * --------------------------
 * Phase 3 (updated): therapists are matched against a semantic profile
 * derived from their bio text — NOT from taxonomy-based specialization tags.
 *
 * Shape stored in `therapists.semantic_profile` (jsonb):
 *   [{ slug: string, weight: number }]      // weight in 0..1
 *
 * If the column is empty, we derive it on the fly from `bio_raw` /
 * `full_description` / `short_intro` using the same alias/intent/name lookup
 * the classifier uses. This keeps the system backward-compatible: therapists
 * that were seeded before this phase still match, and any therapist with a
 * written bio is discoverable without any tagging step.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { lightNormalizeHebrew } from "./hebrew-normalizer";

export type SemanticProfileEntry = { slug: string; weight: number };

/** Parse a stored semantic_profile jsonb into a typed array. Tolerant of shape drift. */
export function parseStoredProfile(raw: unknown): SemanticProfileEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SemanticProfileEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const slug = (item as { slug?: unknown }).slug;
    const weight = (item as { weight?: unknown }).weight;
    if (typeof slug === "string" && slug.length > 0) {
      const w = typeof weight === "number" && weight >= 0 && weight <= 1 ? weight : 0.5;
      out.push({ slug, weight: w });
    }
  }
  return out;
}

/**
 * Extract a semantic profile from free-text bio content by matching against
 * the existing problems / aliases / intents vocabulary. Same knowledge base
 * as the user-side classifier, applied to the therapist side.
 *
 * Returns [] when the bio is too short to yield reliable signal.
 */
export async function extractProfileFromBio(
  bio: string,
  sb: SupabaseClient<Database>,
): Promise<SemanticProfileEntry[]> {
  const normalized = lightNormalizeHebrew(bio || "");
  if (normalized.length < 20) return [];

  // Pull the full vocabulary once and scan the bio locally. This is cheaper
  // than N ILIKE round-trips and works for a bio of arbitrary length.
  const [{ data: problems }, { data: aliases }, { data: intents }] = await Promise.all([
    sb.from("problems").select("id, slug, name"),
    sb.from("problem_aliases").select("problem_id, alias"),
    sb.from("problem_intents").select("problem_id, intent_text"),
  ]);

  const slugById = new Map<string, string>();
  problems?.forEach((p) => slugById.set(p.id, p.slug));

  const rawScore = new Map<string, number>();
  const bump = (id: string | undefined, w: number) => {
    if (!id) return;
    rawScore.set(id, (rawScore.get(id) ?? 0) + w);
  };

  const contains = (needle: string) => {
    const n = lightNormalizeHebrew(needle);
    return n.length >= 2 && normalized.includes(n);
  };

  problems?.forEach((p) => contains(p.name) && bump(p.id, 3));
  aliases?.forEach((a) => contains(a.alias) && bump(a.problem_id, 2));
  intents?.forEach((i) => contains(i.intent_text) && bump(i.problem_id, 1));

  if (rawScore.size === 0) return [];
  const max = Math.max(...rawScore.values());
  const entries: SemanticProfileEntry[] = [];
  for (const [id, s] of rawScore) {
    const slug = slugById.get(id);
    if (!slug) continue;
    entries.push({ slug, weight: Number((s / max).toFixed(3)) });
  }
  return entries.sort((a, b) => b.weight - a.weight);
}

/**
 * Weighted overlap between the user's classifier candidates and a therapist's
 * semantic profile. Returns a similarity score in 0..1.
 *
 *   sim = Σ (userConfidence[slug] * therapistWeight[slug]) / Σ userConfidence
 */
export function semanticSimilarity(
  userMatches: { slug: string; confidence: number }[],
  therapistProfile: SemanticProfileEntry[],
): number {
  if (!userMatches.length || !therapistProfile.length) return 0;
  const tByslug = new Map(therapistProfile.map((e) => [e.slug, e.weight]));
  let num = 0;
  let den = 0;
  for (const m of userMatches) {
    den += m.confidence;
    const w = tByslug.get(m.slug);
    if (w) num += m.confidence * w;
  }
  if (den === 0) return 0;
  return Number((num / den).toFixed(4));
}