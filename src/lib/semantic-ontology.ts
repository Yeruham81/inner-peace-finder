/**
 * Canonical treatment-domain compatibility helpers.
 *
 * The active treatment-domain catalog now lives in `public.problems` and is
 * intentionally flat: the 62 active slugs are independent canonical domains,
 * not a semantic parent/child hierarchy.
 *
 * This module therefore has one runtime responsibility only: safely resolve
 * historical slugs that have an unambiguous one-to-one successor. Ambiguous
 * legacy umbrellas (for example `eating_body`, `developmental` and
 * `neurodiversity`) are deliberately NOT remapped here because each was split
 * into multiple canonical domains and context is required to choose among
 * them.
 */

/**
 * Historical inactive slug -> active canonical replacement.
 *
 * Important rules:
 *   - Never put a currently active canonical slug in this map.
 *   - Never force a one-to-many legacy umbrella into a single replacement.
 *   - This is a compatibility bridge for old stored data only; new
 *     classification/extraction loads active canonical problems from the DB.
 */
export const DEPRECATED_SLUGS: Readonly<Record<string, string>> = Object.freeze({
  career_change: "career_direction",

  loss: "grief_loss",
  bereavement: "grief_loss",

  complex_trauma: "trauma",
  childhood_trauma: "trauma",
  ptsd: "trauma",

  generalized_anxiety: "anxiety",
  panic: "anxiety",
  social_anxiety: "anxiety",
  health_anxiety: "anxiety",
  performance_anxiety: "anxiety",

  major_life_change: "life_transitions",

  social_isolation: "social_belonging",
  loneliness: "social_belonging",

  low_self_esteem: "self_identity",
  identity_crisis: "self_identity",

  low_mood: "depression",
  anhedonia: "depression",

  couples_conflict: "relationships",
  divorce: "relationships",
  breakup: "relationships",
  trust_issues: "relationships",
  attachment_issues: "relationships",

  intimacy_issues: "sexuality_intimacy",
  sexual_dysfunction: "sexuality_intimacy",

  binge_eating: "eating_disorders",

  parenting_stress: "family_parenting",
  parent_child_conflict: "family_parenting",

  anger: "emotional_regulation",
  emotional_overwhelm: "emotional_regulation",

  psychosomatic: "somatic",

  intrusive_thoughts: "ocd_compulsions",
  compulsions: "ocd_compulsions",

  communication_difficulties: "communication_expression",

  existential_anxiety: "existential",
  meaning_crisis: "existential",
});

/**
 * No semantic hierarchy exists between the 62 canonical treatment domains.
 * Kept as an exported empty object for compatibility with diagnostics/tests
 * that may still import the old symbol while the rest of the codebase is
 * migrated.
 */
export const HIERARCHY_PARENT_OF: Readonly<Record<string, string>> = Object.freeze({});

/**
 * Every active canonical treatment domain is searchable. There are no
 * profile-only treatment domains in the new catalog.
 */
export const PROFILE_ONLY_SLUGS: ReadonlySet<string> = new Set();

/**
 * The 483 aliases in `problem_aliases` are now the curated deterministic
 * evidence set. Do not silently override accepted DB aliases with an extra
 * code-side blocklist. Safety/urgent-risk routing is handled before normal
 * semantic classification, not by hiding treatment aliases here.
 */
export const BLOCKED_CLASSIFY_PHRASES: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({});

/** Compatibility helper retained while old callers are migrated. */
export function buildParentOf(base: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.freeze({ ...base });
}

/** Resolve a historical slug when — and only when — it has one safe successor. */
export function resolveDeprecatedSlug(slug: string): string {
  return DEPRECATED_SLUGS[slug] ?? slug;
}

/** No code-side alias suppression remains; retained as a compatibility API. */
export function isBlockedForClassify(_slug: string, _phrase: string): boolean {
  return false;
}

/** Manifest for reporting / ontology diagnostics — not used at runtime. */
export const ONTOLOGY_MANIFEST = Object.freeze({
  deprecated: DEPRECATED_SLUGS,
  hierarchyAdditions: HIERARCHY_PARENT_OF,
  profileOnly: Array.from(PROFILE_ONLY_SLUGS),
  blockedForClassify: {},
});
