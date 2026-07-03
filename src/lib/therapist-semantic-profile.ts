/**
 * Therapist Semantic Profile
 * --------------------------
 * Contract (Phase 4 — runtime, enforced everywhere):
 *
 *   semantic_profile: Array<{ slug: string; weight: number }>
 *
 * A string-only array (["anxiety", ...]) is forbidden. Any legacy row in
 * that shape is normalized on read via `parseStoredProfile` (weight → 1.0
 * default). Missing / invalid weights also default to 1.0. Downstream code
 * must never rely on the forbidden shape.
 *
 * Phase 7 — extraction:
 *   Extraction is flexible (paraphrase / inflection tolerant) and runs off
 *   the same alias/intent/name vocabulary as the user-side classifier.
 *
 * SOURCE-OF-TRUTH POLICY:
 *   `full_description` is the ONLY input for semantic extraction.
 *   `short_intro` is UI-only. `bio_raw` is staging only. Callers must pass
 *   `full_description`; if it's empty, do not extract.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { flexibleHebrewMatch, lightNormalizeHebrew } from "./hebrew-normalizer";

export type SemanticProfileEntry = { slug: string; weight: number };

/** Metadata tag for how a therapist's description was produced. */
export type DescriptionSource = "manual" | "imported" | "llm_generated";

const DEFAULT_WEIGHT = 1.0;

function coerceEntry(item: unknown): SemanticProfileEntry | null {
  // Forbidden shape: bare string. Normalize into the canonical object shape
  // rather than crashing — enforces Phase 4 without breaking legacy data.
  if (typeof item === "string" && item.trim().length > 0) {
    return { slug: item.trim(), weight: DEFAULT_WEIGHT };
  }
  if (!item || typeof item !== "object") return null;
  const obj = item as { slug?: unknown; weight?: unknown };
  if (typeof obj.slug !== "string" || obj.slug.length === 0) return null;
  const w = typeof obj.weight === "number" && obj.weight >= 0 && obj.weight <= 1
    ? obj.weight
    : DEFAULT_WEIGHT;
  return { slug: obj.slug, weight: w };
}

/**
 * Normalize any stored semantic_profile payload into the canonical shape.
 * Tolerates: strict `{slug, weight}[]`, legacy `string[]`, missing weight,
 * out-of-range weight, and unknown extra fields.
 */
export function parseStoredProfile(raw: unknown): SemanticProfileEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SemanticProfileEntry[] = [];
  for (const item of raw) {
    const e = coerceEntry(item);
    if (e) out.push(e);
  }
  return out;
}

/**
 * Serialize back to the canonical JSON contract. Use before writing to the DB
 * so we never persist the forbidden string-array shape.
 */
export function serializeProfile(entries: SemanticProfileEntry[]): SemanticProfileEntry[] {
  return entries
    .map((e) => coerceEntry(e))
    .filter((e): e is SemanticProfileEntry => !!e);
}

/**
 * Extract a semantic profile from a therapist's `full_description`.
 *
 * SOT policy: pass ONLY `full_description`. If empty, returns [] and the
 * caller must treat the therapist as "no extractable data available" — no
 * fallback to short_intro / bio_raw is permitted.
 *
 * Phase 7: matching uses `flexibleHebrewMatch` so synonyms, plural/gender
 * variants, common Hebrew prefixes, and paraphrases still hit the canonical
 * vocabulary.
 */
export async function extractProfileFromBio(
  fullDescription: string | null | undefined,
  sb: SupabaseClient<Database>,
): Promise<SemanticProfileEntry[]> {
  const source = (fullDescription ?? "").trim();
  const normalized = lightNormalizeHebrew(source);
  if (normalized.length < 20) return [];

  const [problemsRes, aliasesRes, intentsRes] = await Promise.all([
    sb.from("problems").select("id, slug, name:name_he"),
    sb.from("problem_aliases").select("problem_id, alias"),
    sb.from("problem_intents").select("problem_slug, intent_text"),
  ]);
  const problems = (problemsRes.data ?? []) as Array<{
    id: string | number;
    slug: string;
    name: string | null;
  }>;
  const aliases = (aliasesRes.data ?? []) as Array<{
    problem_id: string | number;
    alias: string;
  }>;
  const intents = (intentsRes.data ?? []) as unknown as Array<{
    problem_slug: string | null;
    intent_text: string;
  }>;

  const slugById = new Map<string, string>();
  problems.forEach((p) => slugById.set(String(p.id), p.slug));
  const idBySlug = new Map<string, string>();
  problems.forEach((p) => idBySlug.set(p.slug, String(p.id)));

  const rawScore = new Map<string, number>();
  const bump = (id: string | number, w: number) => {
    const key = String(id);
    rawScore.set(key, (rawScore.get(key) ?? 0) + w);
  };

  problems.forEach((p) => {
    if (p.name && flexibleHebrewMatch(p.name, source)) bump(p.id, 3);
  });
  aliases.forEach((a) => {
    if (a.alias && flexibleHebrewMatch(a.alias, source)) bump(a.problem_id, 2);
  });
  intents.forEach((i) => {
    if (!i.intent_text || !i.problem_slug) return;
    const pid = idBySlug.get(i.problem_slug);
    if (pid && flexibleHebrewMatch(i.intent_text, source)) bump(pid, 1);
  });

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
 * semantic profile. Returns 0..1.
 *
 *   sim = Σ (userConfidence[slug] * therapistWeight[slug]) / Σ userConfidence
 *
 * Accepts any input shape via `parseStoredProfile` for safety at call sites.
 */
export function semanticSimilarity(
  userMatches: { slug: string; confidence: number }[],
  therapistProfile: unknown,
): number {
  const profile = parseStoredProfile(therapistProfile);
  if (!userMatches.length || !profile.length) return 0;
  const tByslug = new Map(profile.map((e) => [e.slug, e.weight]));
  let num = 0;
  let den = 0;
  for (const m of userMatches) {
    den += m.confidence;
    const w = tByslug.get(m.slug);
    if (w !== undefined) num += m.confidence * w;
  }
  if (den === 0) return 0;
  return Number((num / den).toFixed(4));
}
