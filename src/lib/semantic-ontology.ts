/**
 * Phase 17C.4B — Ontology Migration Layer.
 *
 * Pure data module. Encodes:
 *
 *   - DEPRECATED_SLUGS: inactive/historical slug → active canonical
 *     replacement. Used as a compatibility bridge for stored profiles and
 *     any legacy signal that reaches downstream ranking/display.
 *
 *   - HIERARCHY_PARENT_OF: extends the engine's child → parent map used
 *     by parent-suppression. Additions are conservative — only pairs the
 *     17C.4A conflict analysis flagged as high-confusion. Suppression
 *     still requires the child to outrank the parent AND the parent to
 *     be weaker (see `PARENT_SUPPRESS_RATIO` in semantic-engine.ts).
 *
 *   - PROFILE_ONLY_SLUGS: umbrella / trait domains that should not appear
 *     as primary user-problem candidates in `classify()` (only as
 *     therapist-profile attributes). They stay fully available inside
 *     `extractProfile()`.
 *
 *   - BLOCKED_CLASSIFY_PHRASES: alias / intent strings suppressed only
 *     during classification to raise precision on documented low-precision
 *     slugs (17C.4A §1). These phrases stay in the DB and remain usable
 *     for `extractProfile()` (therapist profile tagging).
 *
 * Every entry is documented with the failure that motivated it, so a
 * future maintainer can inspect and revert one line without a full
 * ontology re-derivation.
 */

/**
 * Deprecated/inactive slugs and their active canonical replacement.
 * Classification and new profile extraction now load active problems only;
 * this map remains the compatibility bridge for historical stored profiles
 * and any legacy signal that reaches a downstream consumer.
 */
export const DEPRECATED_SLUGS: Readonly<Record<string, string>> = Object.freeze({
  burnout_depression: "performance_functioning",
  burnout: "performance_functioning",
  procrastination: "performance_functioning",
  career_change: "performance_functioning",
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
  acute_crisis: "life_transitions",
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
  substance_use: "addiction",
  behavioral_addiction: "addiction",
  body_image: "eating_body",
  binge_eating: "eating_body",
  parenting_stress: "family_parenting",
  parent_child_conflict: "family_parenting",
  anger: "emotional_regulation",
  emotional_overwhelm: "emotional_regulation",
  psychosomatic: "somatic",
  intrusive_thoughts: "ocd_compulsions",
  compulsions: "ocd_compulsions",
  adhd: "neurodiversity",
  autism: "neurodiversity",
  childhood_development: "developmental",
  communication_difficulties: "communication_expression",
  existential_anxiety: "existential",
  meaning_crisis: "existential",
});

/**
 * Extra child → parent edges appended on top of the engine's PARENT_OF map.
 * Each entry is a candidate for parent-suppression only; suppression still
 * requires the conservative rule already in the engine.
 */
export const HIERARCHY_PARENT_OF: Readonly<Record<string, string>> = Object.freeze({
  // 17C.4A conflict matrix: low_self_esteem outranks identity_crisis in 3
  // cases; both are kept as distinct concepts but the parent may be
  // suppressed when the child clearly dominates.
  low_self_esteem: "identity_crisis",
  identity_crisis: "self_identity",
});

/**
 * Umbrella / trait domains excluded from classify() output. They remain
 * fully available in extractProfile() for therapist tagging.
 *
 * Rationale (17C.4A §5): every slug in this set had 0 corpus targets and
 * generated only FP noise when it fired as a user-facing problem candidate.
 */
export const PROFILE_ONLY_SLUGS: ReadonlySet<string> = new Set([
  "communication_expression",
  "neurodiversity",
  "somatic",
  "emotional_regulation",
  "performance_functioning",
  "family_parenting",
  // parent_child_conflict has zero vocab today and — when it eventually
  // gets vocab — belongs under the family_parenting profile umbrella.
  "parent_child_conflict",
]);

/**
 * Classification-only vocabulary suppression. Map: slug → set of exact
 * alias / intent strings (matched by normalized-equality against the DB
 * row's raw text) that should not fire as classification evidence.
 *
 * The DB rows are left untouched so `extractProfile()` still uses them
 * for therapist tagging. Every phrase is annotated with the false-positive
 * class it was created to suppress (see 17C.4A §1 precision analysis).
 */
export const BLOCKED_CLASSIFY_PHRASES: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  // low_mood: intentionally NOT blocked. Its aliases look generic in
  // isolation but the corpus shows low_mood requires them for recall
  // (e.g. "אני מרגיש רע" → low_mood). FPs on low_mood are better
  // handled by the depression → low_mood parent suppression already
  // in PARENT_OF (semantic-engine.ts).
  identity_crisis: new Set([
    "אני מחפש את עצמי", // life-transition phrasing → over-fires
    "אני מחפשת את עצמי",
  ]),
  loneliness: new Set([
    // "אין לי חברים" / "אין לי עם מי לדבר" left in place — they carry
    // real loneliness signal in the corpus and only harm precision when
    // the query is actually about social_belonging (which is now
    // profile-only and no longer competes at classify time).
  ]),
  social_anxiety: new Set([
    "פחד מאנשים", // fires on generic "afraid of people"
  ]),
  psychosomatic: new Set([
    "כאב ראש מלחץ", // short overlap with stress/burnout queries
    "כאבי בטן מלחץ",
  ]),
  trust_issues: new Set([
    "קשה לי לסמוך", // near-duplicate of relationships alias
  ]),
});

/** Combined child → parent map. Kept as a pure function so the engine can
 * consume it in one line without ever mutating either source table. */
export function buildParentOf(base: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.freeze({ ...base, ...HIERARCHY_PARENT_OF });
}

/** Resolve a slug through the deprecation table (single hop is enough for
 * this ontology; the table has no chains). */
export function resolveDeprecatedSlug(slug: string): string {
  return DEPRECATED_SLUGS[slug] ?? slug;
}

/** True when an alias / intent phrase is suppressed for classification. */
export function isBlockedForClassify(slug: string, phrase: string): boolean {
  const set = BLOCKED_CLASSIFY_PHRASES[slug];
  return !!set && set.has(phrase);
}

/** Manifest for reporting / ontology diagnostics — not used at runtime. */
export const ONTOLOGY_MANIFEST = Object.freeze({
  deprecated: DEPRECATED_SLUGS,
  hierarchyAdditions: HIERARCHY_PARENT_OF,
  profileOnly: Array.from(PROFILE_ONLY_SLUGS),
  blockedForClassify: Object.fromEntries(Object.entries(BLOCKED_CLASSIFY_PHRASES).map(([k, v]) => [k, Array.from(v)])),
});
