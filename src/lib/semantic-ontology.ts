/**
 * Phase 17C.4B — Ontology Migration Layer.
 *
 * Pure data module. Encodes:
 *
 *   - DEPRECATED_SLUGS: slug → canonical replacement. Applied only in the
 *     `classify()` pipeline. Legacy stored slugs remain interpretable and
 *     `extractProfile()` output is left untouched so historical therapist
 *     tagging (and the profile-extraction regression suite) doesn't drift.
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
 * Deprecated slugs and their canonical replacement. Applied ONLY in
 * `classify()` — the deprecated slug never appears in classifier output;
 * its evidence is merged into the replacement slug's evidence bucket.
 *
 * Not applied in `extractProfile()`, so therapist profiles that already
 * store the deprecated slug (or new profiles whose full_description
 * literally names it) continue to round-trip unchanged. This is a
 * migration layer, not a destructive delete.
 */
export const DEPRECATED_SLUGS: Readonly<Record<string, string>> = Object.freeze({
  // Empty vocab domain that only produced FPs against the "burnout" cluster.
  burnout_depression: "burnout",
  // Near-synonyms subsumed by grief_loss.
  loss: "grief_loss",
  bereavement: "grief_loss",
  // Trauma subtypes — retained in extractProfile, unified in classify.
  complex_trauma: "trauma",
  // Anxiety subtype without independent vocabulary — folds into anxiety.
  generalized_anxiety: "anxiety",
  // Life-transitions duplicate.
  major_life_change: "life_transitions",
  // Loneliness sibling with zero vocabulary + FP against loneliness.
  social_isolation: "loneliness",
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
  low_mood: new Set([
    "מרגיש רע",      // fires on any negative sentence
    "מרגישה רע",     // fires on any negative sentence
    "לא במיטבי",     // over-broad affective term
  ]),
  identity_crisis: new Set([
    "אני מחפש את עצמי",   // life-transition phrasing → over-fires
    "אני מחפשת את עצמי",
  ]),
  loneliness: new Set([
    "אין לי חברים",       // also matches social_belonging aliases
    "אין לי עם מי לדבר",  // over-broad
  ]),
  social_anxiety: new Set([
    "פחד מאנשים",         // fires on generic "afraid of people"
    "בושה חברתית",        // fires on any social embarrassment
  ]),
  psychosomatic: new Set([
    "כאב ראש מלחץ",       // short overlap with stress/burnout queries
    "כאבי בטן מלחץ",
  ]),
  trust_issues: new Set([
    "קשה לי לסמוך",       // near-duplicate of relationships alias
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
  blockedForClassify: Object.fromEntries(
    Object.entries(BLOCKED_CLASSIFY_PHRASES).map(([k, v]) => [k, Array.from(v)]),
  ),
});