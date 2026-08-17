/**
 * Therapist Semantic Profile — persistence + coercion utilities only
 * (Phase 15).
 *
 * Contract (Phase 4, enforced at runtime everywhere):
 *
 *   semantic_profile: Array<{ slug: string; weight: number }>
 *
 * A string-only array (["anxiety", ...]) is forbidden. Any legacy row in
 * that shape is normalized on read via `parseStoredProfile` (weight → 1.0).
 *
 * Semantic *extraction* and *similarity scoring* live in
 * `./semantic-engine` (SemanticEngine.extractProfile / scoreProfiles). This
 * module intentionally does NOT import matching internals — that is the
 * engine's exclusive responsibility (Phase 16 authority rule).
 */

export type SemanticProfileEntry = { slug: string; weight: number };

/** Metadata tag for how a therapist's description was produced. */
export type DescriptionSource = "manual" | "imported" | "llm_generated";

const DEFAULT_WEIGHT = 1.0;

function coerceEntry(item: unknown): SemanticProfileEntry | null {
  if (typeof item === "string" && item.trim().length > 0) {
    return { slug: item.trim(), weight: DEFAULT_WEIGHT };
  }
  if (!item || typeof item !== "object") return null;
  const obj = item as { slug?: unknown; weight?: unknown };
  if (typeof obj.slug !== "string" || obj.slug.length === 0) return null;
  const w =
    typeof obj.weight === "number" && obj.weight >= 0 && obj.weight <= 1
      ? obj.weight
      : DEFAULT_WEIGHT;
  return { slug: obj.slug, weight: w };
}

/** Normalize any stored semantic_profile payload into the canonical shape. */
export function parseStoredProfile(raw: unknown): SemanticProfileEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SemanticProfileEntry[] = [];
  for (const item of raw) {
    const e = coerceEntry(item);
    if (e) out.push(e);
  }
  return out;
}

/** Serialize back to the canonical JSON contract before writing to the DB. */
export function serializeProfile(entries: SemanticProfileEntry[]): SemanticProfileEntry[] {
  return entries.map((e) => coerceEntry(e)).filter((e): e is SemanticProfileEntry => !!e);
}
