/**
 * Phase Q1 v4 — pure query interpreter.
 * Deterministic, side-effect free. Uses a preloaded Catalog only.
 *
 * All lookup constants (generic prefixes, preference markers, explicit
 * gender tokens, delivery modes, unresolved services, catalog variants)
 * are normalized through the SAME pipeline as the user query
 * (`normalizeForInterpretation`). The pipeline is a subset of
 * `lightNormalizeHebrew` that intentionally SKIPS `foldInflections` so
 * gender-bearing suffixes like "אישה" vs "איש" or the feminine
 * "פסיכולוגית" remain distinguishable.
 */

import {
  normalizeForInterpretation,
  normalizeList as normList,
} from "./query-normalization";
import type {
  Catalog,
  GenderEvidence,
  Intent,
  InterpretationResult,
  SoftPreferences,
  StructuredFilters,
  TherapistGender,
  UnresolvedCode,
} from "./query-interpreter.types";

const GENERIC_PREFIXES: string[] = normList([
  "אני מחפש את", "אני מחפש", "אני מחפשת",
  "אני צריך", "אני צריכה",
  "אשמח לקבל", "אשמח למצוא",
  "רוצה למצוא", "רוצה לפגוש", "אני רוצה",
  "אפשר לקבל", "יש לכם", "יש לך",
  "מחפש", "מחפשת", "צריך", "צריכה", "רוצה",
  "מעוניין ב", "מעוניינת ב", "מעוניין", "מעוניינת",
]);

const PREFERENCE_MARKERS: string[] = normList(["עדיף", "רצוי", "אם אפשר", "כדאי"]);
const PREFERENCE_MARKER_SET = new Set(PREFERENCE_MARKERS);

const EXPLICIT_FEMALE_TOKENS = new Set(
  normList(["אישה", "אשה", "נשית", "מטפלת"]),
);
const EXPLICIT_MALE_TOKENS = new Set(normList(["גבר", "זכר"]));

const DELIVERY_MODE_ALIASES: Record<string, string> = (() => {
  const raw: Record<string, string> = {
    אונליין: "online", אונלין: "online", זום: "online",
    מקוון: "online", מקוונת: "online", מרחוק: "online",
    // Canonical `location_type` enum values only — no `in_person`.
    פרונטלי: "clinic", בקליניקה: "clinic", קליניקה: "clinic",
    "בית": "home_visit", "ביקור בית": "home_visit",
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeForInterpretation(k);
    if (nk) out[nk] = v;
  }
  return out;
})();

const UNRECOGNIZED_SERVICE_PHRASES: string[] = normList([
  // Deliberately minimal — LLM phase will handle broader coverage.
  "מאבחן קשב", "אבחון קשב",
  "הדרכת הורים",
  "טיפול זוגי",
]);

/**
 * Common Hebrew one-letter prefixes. We attempt fallback prefix stripping
 * (iteratively, up to 2 letters — e.g. "מהחרדה" → "חרדה") ONLY as a
 * secondary lookup: the raw normalized token is tried first, so real
 * words that happen to begin with a prefix letter (e.g. "מטפלת") are
 * never mangled.
 */
const HEBREW_PREFIX_LETTERS = new Set(["ה", "ו", "ב", "כ", "ל", "מ", "ש"]);

function stripOnePrefix(token: string): string | null {
  if (token.length < 3) return null;
  if (!HEBREW_PREFIX_LETTERS.has(token[0]!)) return null;
  const rest = token.slice(1);
  if (rest.length < 2) return null;
  return rest;
}

/** All candidate forms for a single token: raw, then iteratively prefix-stripped. */
function tokenPrefixVariants(token: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let cur: string | null = token;
  for (let i = 0; i < 3 && cur; i++) {
    if (!seen.has(cur)) {
      seen.add(cur);
      out.push(cur);
    }
    cur = stripOnePrefix(cur);
  }
  return out;
}

function stripGenericPrefix(normalized: string): { head: string; stripped: boolean } {
  let head = normalized;
  let stripped = false;
  for (let guard = 0; guard < 4; guard++) {
    let matched = false;
    for (const p of GENERIC_PREFIXES) {
      if (head === p) return { head: "", stripped: true };
      if (head.startsWith(p + " ")) {
        head = head.slice(p.length + 1).trim();
        matched = true;
        stripped = true;
        break;
      }
    }
    if (!matched) break;
  }
  return { head, stripped };
}

/** Tokenize an already-normalized string. Preserves prefix letters; the
 *  extractor tries prefix-stripped fallbacks per span. */
function tokenizeNormalized(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(" ").filter((t) => t.length >= 1);
}

function* windowsUpTo(
  tokens: string[],
  maxLen: number,
): Iterable<{ start: number; end: number; text: string }> {
  for (let start = 0; start < tokens.length; start++) {
    for (let len = 1; len <= maxLen && start + len <= tokens.length; len++) {
      const end = start + len;
      yield { start, end, text: tokens.slice(start, end).join(" ") };
    }
  }
}

type StructuredHit =
  | { kind: "profession"; slug: string; start: number; end: number; feminine: boolean }
  | { kind: "modality"; slug: string; start: number; end: number }
  | { kind: "population"; slug: string; start: number; end: number }
  | { kind: "language"; code: string; start: number; end: number }
  | { kind: "city"; canonical: string; start: number; end: number }
  | { kind: "delivery"; mode: string; start: number; end: number }
  | { kind: "name"; therapistId: string; start: number; end: number };

/** Catalog variants are normalized via the same pipeline as user input. */
const normVariant = normalizeForInterpretation;

function buildLookupIndex(catalog: Catalog): {
  professionByPhrase: Map<string, { slug: string; feminine: boolean }>;
  modalityByPhrase: Map<string, string>;
  populationByPhrase: Map<string, string>;
  languageByPhrase: Map<string, string>;
  cityByPhrase: Map<string, string>;
  nameByPhrase: Map<string, string>;
  maxLen: number;
} {
  const professionByPhrase = new Map<string, { slug: string; feminine: boolean }>();
  const modalityByPhrase = new Map<string, string>();
  const populationByPhrase = new Map<string, string>();
  const languageByPhrase = new Map<string, string>();
  const cityByPhrase = new Map<string, string>();
  const nameByPhrase = new Map<string, string>();
  let maxLen = 1;
  const bump = (phrase: string) => {
    const wc = phrase.split(" ").filter(Boolean).length;
    if (wc > maxLen) maxLen = wc;
  };
  for (const p of catalog.professions) {
    const fem = new Set(p.feminineVariants.map(normVariant));
    for (const v of p.nameVariants) {
      const nv = normVariant(v);
      if (!nv) continue;
      professionByPhrase.set(nv, { slug: p.slug, feminine: fem.has(nv) });
      bump(nv);
    }
  }
  for (const m of catalog.modalities) {
    for (const v of m.nameVariants) {
      const nv = normVariant(v);
      if (!nv) continue;
      modalityByPhrase.set(nv, m.slug);
      bump(nv);
    }
  }
  for (const p of catalog.populations) {
    for (const v of [p.name_he, ...p.aliases]) {
      const nv = normVariant(v);
      if (!nv) continue;
      populationByPhrase.set(nv, p.slug);
      bump(nv);
    }
  }
  for (const l of catalog.languages) {
    for (const v of [l.name_he, ...l.aliases]) {
      const nv = normVariant(v);
      if (!nv) continue;
      languageByPhrase.set(nv, l.code);
      bump(nv);
    }
  }
  for (const c of catalog.cities) {
    for (const v of [c.canonical, ...c.aliases]) {
      const nv = normVariant(v);
      if (!nv) continue;
      cityByPhrase.set(nv, c.canonical);
      bump(nv);
    }
  }
  for (const t of catalog.therapistNames) {
    const full = normVariant(t.tokens.join(" "));
    if (full) { nameByPhrase.set(full, t.id); bump(full); }
    const first = t.tokens[0];
    if (first && catalog.firstNameCount.get(first) === 1) {
      const nf = normVariant(first);
      if (nf) nameByPhrase.set(nf, t.id);
    }
  }
  return {
    professionByPhrase, modalityByPhrase, populationByPhrase,
    languageByPhrase, cityByPhrase, nameByPhrase,
    maxLen: Math.max(maxLen, 3),
  };
}

type LookupIndex = ReturnType<typeof buildLookupIndex>;

function lookupPhrase(
  idx: LookupIndex,
  text: string,
  start: number,
  end: number,
): StructuredHit | null {
  const prof = idx.professionByPhrase.get(text);
  if (prof) return { kind: "profession", slug: prof.slug, feminine: prof.feminine, start, end };
  const mod = idx.modalityByPhrase.get(text);
  if (mod) return { kind: "modality", slug: mod, start, end };
  const pop = idx.populationByPhrase.get(text);
  if (pop) return { kind: "population", slug: pop, start, end };
  const lang = idx.languageByPhrase.get(text);
  if (lang) return { kind: "language", code: lang, start, end };
  const city = idx.cityByPhrase.get(text);
  if (city) return { kind: "city", canonical: city, start, end };
  const name = idx.nameByPhrase.get(text);
  if (name) return { kind: "name", therapistId: name, start, end };
  const del = DELIVERY_MODE_ALIASES[text];
  if (del) return { kind: "delivery", mode: del, start, end };
  return null;
}

function extractStructured(
  tokens: string[],
  idx: LookupIndex,
): { hits: StructuredHit[]; consumedMask: boolean[] } {
  const consumedMask = new Array<boolean>(tokens.length).fill(false);
  const hits: StructuredHit[] = [];
  const spans = Array.from(windowsUpTo(tokens, idx.maxLen));
  // Longest spans first, then earliest start — deterministic.
  spans.sort((a, b) => b.end - b.start - (a.end - a.start));
  for (const span of spans) {
    if (consumedMask.slice(span.start, span.end).some(Boolean)) continue;
    let hit: StructuredHit | null = null;
    // Try candidate phrases: raw first, then iteratively prefix-stripped
    // versions of the FIRST token (Hebrew prefixes attach to the head of a
    // noun phrase). This is a fallback only — real words like "מטפלת"
    // never lose their initial letter because their raw form is tried first
    // and matches (or fails cleanly) before any strip.
    const firstToken = tokens[span.start]!;
    const tail = tokens.slice(span.start + 1, span.end);
    for (const firstVar of tokenPrefixVariants(firstToken)) {
      const phrase = tail.length === 0 ? firstVar : `${firstVar} ${tail.join(" ")}`;
      hit = lookupPhrase(idx, phrase, span.start, span.end);
      if (hit) break;
    }
    if (hit) {
      hits.push(hit);
      for (let i = span.start; i < span.end; i++) consumedMask[i] = true;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return { hits, consumedMask };
}

/**
 * A preference marker binds to the CLOSEST following entity only. Once a
 * hit has claimed a marker, later hits do not inherit it. This function
 * walks backward from `hitStart` up to 4 tokens, stopping as soon as it
 * crosses into a previously consumed structured span belonging to an
 * earlier hit — that hit already owns the marker, if any.
 *
 * `consumedByPrevHit[i]` must be true only for tokens consumed by a hit
 * whose end index is ≤ hitStart. Explicit-gender consumption ("מטפלת")
 * and preference-marker consumption itself are NOT part of that mask,
 * so the walker can still see markers separated from their target by a
 * feminine profession form or a stray single-letter Hebrew prefix.
 */
function hasImmediatePreferenceMarker(
  tokens: string[],
  hitStart: number,
  consumedByPrevHit: boolean[],
): boolean {
  if (hitStart === 0) return false;
  const back = Math.min(4, hitStart);
  for (let k = 1; k <= back; k++) {
    const i = hitStart - k;
    if (consumedByPrevHit[i]) return false;
    if (PREFERENCE_MARKER_SET.has(tokens[i]!)) return true;
  }
  for (let len = 2; len <= 3; len++) {
    if (hitStart >= len) {
      const start = hitStart - len;
      if (consumedByPrevHit.slice(start, hitStart).some(Boolean)) continue;
      const phrase = tokens.slice(start, hitStart).join(" ");
      if (PREFERENCE_MARKER_SET.has(phrase)) return true;
    }
  }
  return false;
}

function detectExplicitGender(tokens: string[]): {
  hard: TherapistGender | null;
  evidence: GenderEvidence[];
  conflict: boolean;
  consumed: Set<number>;
} {
  const evidence: GenderEvidence[] = [];
  const consumed = new Set<number>();
  let female = false;
  let male = false;
  tokens.forEach((tok, i) => {
    if (EXPLICIT_FEMALE_TOKENS.has(tok)) { female = true; evidence.push("explicit_female"); consumed.add(i); }
    else if (EXPLICIT_MALE_TOKENS.has(tok)) { male = true; evidence.push("explicit_male"); consumed.add(i); }
  });
  const conflict = female && male;
  const hard: TherapistGender | null = conflict ? null : female ? "female" : male ? "male" : null;
  return { hard, evidence, conflict, consumed };
}

function detectUnresolvedService(head: string): string | null {
  const lower = head.trim();
  if (!lower) return null;
  for (const phrase of UNRECOGNIZED_SERVICE_PHRASES) {
    if (
      lower === phrase ||
      lower.startsWith(phrase + " ") ||
      lower.endsWith(" " + phrase) ||
      lower.includes(" " + phrase + " ")
    ) {
      return phrase;
    }
  }
  return null;
}

function classifyIntent(args: {
  hasStructured: boolean; hasSemantic: boolean; hasName: boolean;
  unresolvedPrimary: boolean; hasAnyToken: boolean;
}): Intent {
  if (args.unresolvedPrimary) return "unresolved_service";
  if (!args.hasAnyToken) return "unknown";
  if (args.hasName && !args.hasStructured && !args.hasSemantic) return "named";
  if (args.hasStructured && args.hasSemantic) return "hybrid";
  if (args.hasStructured) return "structured";
  if (args.hasSemantic) return "semantic";
  return "unknown";
}

export function interpretQuery(raw: string, catalog: Catalog): InterpretationResult {
  const normalized = normalizeForInterpretation(raw);
  const emptyHard: StructuredFilters = {
    professionSlugs: [], modalitySlugs: [], populationSlugs: [],
    languageCodes: [], deliveryModes: [], city: null, therapistGender: null,
  };
  const emptySoft: SoftPreferences = {
    professionSlugs: [], modalitySlugs: [], populationSlugs: [],
    languageCodes: [], cities: [], deliveryModes: [], genders: [],
  };
  if (!normalized) {
    return {
      raw, normalized, intent: "unknown",
      unresolvedPrimary: false, primaryHead: null,
      hardFilters: emptyHard, softPreferences: emptySoft,
      therapistNameIds: [], semanticRemainder: "",
      genderEvidence: [], unresolvedCodes: ["empty_query"],
    };
  }

  const { head: strippedHead } = stripGenericPrefix(normalized);
  const headForIntent = strippedHead || normalized;
  const unresolvedPhrase = detectUnresolvedService(headForIntent);

  // Tokens are derived from the head (with any generic request prefix
  // stripped) so filler like "אני מחפש" cannot pollute the semantic
  // remainder or the intent classification.
  const tokens = tokenizeNormalized(headForIntent);
  const idx = buildLookupIndex(catalog);
  const { hits, consumedMask } = extractStructured(tokens, idx);

  const gender = detectExplicitGender(tokens);
  for (const i of gender.consumed) consumedMask[i] = true;

  // Preference markers ("עדיף", "רצוי", ...) are functional cues, never
  // semantic content. Once we've used them to route a following entity
  // into softPreferences, mark them consumed so they cannot leak into
  // semanticRemainder. Multi-word markers are handled by matching the
  // full phrase and consuming the whole span.
  for (let i = 0; i < tokens.length; i++) {
    if (consumedMask[i]) continue;
    if (PREFERENCE_MARKER_SET.has(tokens[i]!)) {
      consumedMask[i] = true;
      continue;
    }
    for (let len = 3; len >= 2; len--) {
      if (i + len > tokens.length) continue;
      const phrase = tokens.slice(i, i + len).join(" ");
      if (PREFERENCE_MARKER_SET.has(phrase)) {
        for (let k = i; k < i + len; k++) consumedMask[k] = true;
        i += len - 1;
        break;
      }
    }
  }

  // Structural filler: after `ב-CBT` → `ב cbt`, the stray Hebrew
  // preposition "ב" precedes a consumed structured hit. It is not a
  // semantic token and must not leak into the remainder. Same applies
  // to any single-letter Hebrew prefix immediately adjacent to a
  // consumed span on either side.
  for (let i = 0; i < tokens.length; i++) {
    if (consumedMask[i]) continue;
    const tok = tokens[i]!;
    if (tok.length !== 1 || !HEBREW_PREFIX_LETTERS.has(tok)) continue;
    const nextConsumed = i + 1 < tokens.length && consumedMask[i + 1]!;
    const prevConsumed = i > 0 && consumedMask[i - 1]!;
    if (nextConsumed || prevConsumed) consumedMask[i] = true;
  }

  const hardFilters: StructuredFilters = { ...emptyHard };
  const softPreferences: SoftPreferences = {
    professionSlugs: [], modalitySlugs: [], populationSlugs: [],
    languageCodes: [], cities: [], deliveryModes: [], genders: [],
  };
  const therapistNameIds: string[] = [];
  const genderEvidence: GenderEvidence[] = [...gender.evidence];
  const unresolvedCodes: UnresolvedCode[] = [];
  if (gender.conflict) unresolvedCodes.push("gender_conflict");

  const uniq = <T,>(arr: T[]): T[] => Array.from(new Set(arr));

  // Track spans consumed by EARLIER hits so the preference-marker walker
  // never crosses into another hit's territory.
  const consumedByPrevHit = new Array<boolean>(tokens.length).fill(false);
  for (const hit of hits) {
    const preferred = hasImmediatePreferenceMarker(tokens, hit.start, consumedByPrevHit);
    for (let k = hit.start; k < hit.end; k++) consumedByPrevHit[k] = true;
    switch (hit.kind) {
      case "profession":
        if (hit.feminine && !gender.conflict) {
          if (!hardFilters.therapistGender) hardFilters.therapistGender = "female";
          if (!genderEvidence.includes("feminine_profession_form"))
            genderEvidence.push("feminine_profession_form");
        }
        (preferred ? softPreferences.professionSlugs : hardFilters.professionSlugs).push(hit.slug);
        break;
      case "modality":
        (preferred ? softPreferences.modalitySlugs : hardFilters.modalitySlugs).push(hit.slug);
        break;
      case "population":
        (preferred ? softPreferences.populationSlugs : hardFilters.populationSlugs).push(hit.slug);
        break;
      case "language":
        (preferred ? softPreferences.languageCodes : hardFilters.languageCodes).push(hit.code);
        break;
      case "city":
        if (preferred) softPreferences.cities.push(hit.canonical);
        else if (!hardFilters.city) hardFilters.city = hit.canonical;
        else softPreferences.cities.push(hit.canonical);
        break;
      case "delivery":
        (preferred ? softPreferences.deliveryModes : hardFilters.deliveryModes).push(hit.mode);
        break;
      case "name":
        therapistNameIds.push(hit.therapistId);
        break;
    }
  }

  // Gender resolution:
  //   - `gender.hard` is the deterministic pick from EXPLICIT_FEMALE/MALE tokens.
  //   - Feminine profession forms may have already set female on hardFilters.
  //   - If explicit male evidence collides with a feminine-form profession,
  //     that is a conflict; drop the filter and record `gender_conflict`.
  const femFromProfession = genderEvidence.includes("feminine_profession_form");
  if (gender.hard === "male" && femFromProfession) {
    hardFilters.therapistGender = null;
    if (!unresolvedCodes.includes("gender_conflict")) unresolvedCodes.push("gender_conflict");
  } else if (gender.hard && !hardFilters.therapistGender) {
    hardFilters.therapistGender = gender.hard;
  }

  hardFilters.professionSlugs = uniq(hardFilters.professionSlugs);
  hardFilters.modalitySlugs = uniq(hardFilters.modalitySlugs);
  hardFilters.populationSlugs = uniq(hardFilters.populationSlugs);
  hardFilters.languageCodes = uniq(hardFilters.languageCodes);
  hardFilters.deliveryModes = uniq(hardFilters.deliveryModes);
  softPreferences.professionSlugs = uniq(softPreferences.professionSlugs);
  softPreferences.modalitySlugs = uniq(softPreferences.modalitySlugs);
  softPreferences.populationSlugs = uniq(softPreferences.populationSlugs);
  softPreferences.languageCodes = uniq(softPreferences.languageCodes);
  softPreferences.cities = uniq(softPreferences.cities);
  softPreferences.deliveryModes = uniq(softPreferences.deliveryModes);
  softPreferences.genders = uniq(softPreferences.genders);

  const remainderTokens = tokens.filter((_t, i) => !consumedMask[i]);
  const semanticRemainder = remainderTokens.join(" ");

  const hasStructured =
    hardFilters.professionSlugs.length > 0 ||
    hardFilters.modalitySlugs.length > 0 ||
    hardFilters.populationSlugs.length > 0 ||
    hardFilters.languageCodes.length > 0 ||
    hardFilters.deliveryModes.length > 0 ||
    hardFilters.city !== null ||
    hardFilters.therapistGender !== null;
  const hasName = therapistNameIds.length > 0;
  const hasSemantic = remainderTokens.length > 0;
  // Unresolved-service guard: an unsupported PRIMARY intent (present at the
  // head of the stripped query) marks the query unresolved even when a
  // trailing city/modality would otherwise create a broad structured search.
  // A therapist-name constraint does override — that path is handled below.
  const unresolvedPrimary = Boolean(unresolvedPhrase) && !hasName;
  if (unresolvedPrimary) unresolvedCodes.push("unrecognized_service");

  const intent = classifyIntent({
    hasStructured, hasSemantic, hasName,
    unresolvedPrimary, hasAnyToken: tokens.length > 0,
  });

  return {
    raw, normalized, intent,
    unresolvedPrimary,
    primaryHead: headForIntent || null,
    hardFilters, softPreferences,
    therapistNameIds, semanticRemainder,
    genderEvidence, unresolvedCodes,
  };
}

export const __internals = {
  normalizeForInterpretation,
  stripGenericPrefix,
  detectExplicitGender,
  detectUnresolvedService,
  tokenPrefixVariants,
};