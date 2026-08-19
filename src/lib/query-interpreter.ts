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

import { REGION_DEFINITIONS, REGION_SLUGS, type RegionSlug } from "./locality-options";
import { normalizeForInterpretation, normalizeList as normList } from "./query-normalization";
import { THERAPY_FORMAT_SLUGS, type TherapyFormatSlug } from "./search-contract";
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
  "אני מחפש את",
  "אני מחפש",
  "אני מחפשת",
  "אני צריך",
  "אני צריכה",
  "אשמח לקבל",
  "אשמח למצוא",
  "רוצה למצוא",
  "רוצה לפגוש",
  "אני רוצה",
  "אפשר לקבל",
  "יש לכם",
  "יש לך",
  "מחפש",
  "מחפשת",
  "צריך",
  "צריכה",
  "רוצה",
  "מעוניין ב",
  "מעוניינת ב",
  "מעוניין",
  "מעוניינת",
]);

const PREFERENCE_MARKERS: string[] = normList(["עדיף", "רצוי", "אם אפשר", "כדאי"]);
const PREFERENCE_MARKER_SET = new Set(PREFERENCE_MARKERS);

const EXPLICIT_FEMALE_TOKENS = new Set(normList(["אישה", "אשה", "נשית", "מטפלת", "מטפלות"]));
const EXPLICIT_MALE_TOKENS = new Set(normList(["גבר", "זכר"]));

/**
 * Generic THERAPIST nouns used only as anchors for an explicit therapist-gender
 * request. Patient nouns such as "מטופל" deliberately do not belong here.
 */
const THERAPIST_NOUNS = new Set(normList(["מטפל", "מטפלת", "מטפלים", "מטפלות"]));

/** Phrases that explicitly say therapist gender is NOT a requirement. */
const GENDER_NEUTRAL_PREFERENCE_PHRASES = normList([
  "אין לי העדפה למגדר",
  "אין העדפה למגדר",
  "ללא העדפה למגדר",
  "לא משנה לי המגדר",
  "המגדר לא משנה לי",
  "לא משנה לי גבר או אישה",
  "לא משנה לי אישה או גבר",
  "לא משנה גבר או אישה",
  "לא משנה אישה או גבר",
  "גבר או אישה לא משנה לי",
  "אישה או גבר לא משנה לי",
  "גבר או אישה זה לא משנה",
  "אישה או גבר זה לא משנה",
  "כל מגדר",
  "לא משנה לי מטפל או מטפלת",
  "לא משנה לי מטפלת או מטפל",
  "אין לי העדפה בין מטפל למטפלת",
  "אין לי העדפה אם זה מטפל או מטפלת",
  "מטפל או מטפלת לא משנה לי",
  "מטפל או מטפלת",
]);

const DELIVERY_MODE_ALIASES: Record<string, string> = (() => {
  const raw: Record<string, string> = {
    אונליין: "online",
    אונלין: "online",
    זום: "online",
    מקוון: "online",
    מקוונת: "online",
    מרחוק: "online",
    "טיפול מרחוק": "online",
    "פגישה מרחוק": "online",
    "טיפול אונליין": "online",
    "פגישה אונליין": "online",
    "שיחת וידאו": "online",
    // Canonical `location_type` enum values only — no `in_person`.
    פרונטלי: "clinic",
    פרונטלית: "clinic",
    בקליניקה: "clinic",
    קליניקה: "clinic",
    "טיפול בקליניקה": "clinic",
    "פגישה בקליניקה": "clinic",
    "פנים אל פנים": "clinic",
    "ביקור בית": "home_visit",
    "ביקורי בית": "home_visit",
    "טיפול בבית": "home_visit",
    "פגישה בבית": "home_visit",
    "בבית המטופל": "home_visit",
    "בבית המטופלת": "home_visit",
    "טיפול בבית המטופל": "home_visit",
    "טיפול בבית המטופלת": "home_visit",
    "הגעה לבית המטופל": "home_visit",
    "הגעה לבית המטופלת": "home_visit",
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeForInterpretation(k);
    if (nk) out[nk] = v;
  }
  return out;
})();

/**
 * "טיפול בבית" is useful, but it must not fire inside "טיפול בבית הספר",
 * "טיפול בבית חולים" or a locality such as "בית שמש".
 */
const NON_HOME_VISIT_FOLLOWERS = new Set(normList(["ספר", "חולים", "אבות", "מרקחת", "משפט", "שמש"]));

const THERAPY_FORMAT_ALIASES: Record<string, TherapyFormatSlug> = (() => {
  const raw: Record<TherapyFormatSlug, readonly string[]> = {
    individual: ["טיפול פרטני", "טיפול אישי", "טיפול אחד על אחד", "פגישה פרטנית"],
    couples: ["טיפול זוגי", "טיפול לזוגות", "ייעוץ זוגי"],
    family: ["טיפול משפחתי", "טיפול למשפחה", "טיפול למשפחות"],
    parent_child: ["טיפול משותף להורה ולילד", "טיפול הורה וילד", "טיפול הורה וילדה"],
    group: ["טיפול קבוצתי", "קבוצה טיפולית"],
    parent_guidance: ["הדרכת הורים", "הדרכה הורית", "ייעוץ להורים", "ליווי הורים"],
  };
  const out: Record<string, TherapyFormatSlug> = {};
  for (const slug of THERAPY_FORMAT_SLUGS) {
    for (const phrase of raw[slug]) {
      const normalized = normalizeForInterpretation(phrase);
      if (normalized) out[normalized] = slug;
    }
  }
  return out;
})();

/**
 * Natural-language aliases for Tipulinks' eight product regions. City names
 * alone stay cities: "חיפה" and "ירושלים" are intentionally NOT region
 * aliases, while "אזור חיפה" / "אזור ירושלים" are.
 */
const REGION_QUERY_ALIASES: Record<string, RegionSlug> = (() => {
  const raw: Record<RegionSlug, readonly string[]> = {
    north: ["צפון", "הצפון", "אזור הצפון", "אזור צפון", "צפון הארץ"],
    "haifa-krayot": ["חיפה והקריות", "אזור חיפה", "אזור חיפה והקריות", "הקריות", "קריות", "אזור הקריות"],
    sharon: ["השרון", "שרון", "אזור השרון"],
    "tel-aviv-gush-dan": ["תל אביב וגוש דן", "גוש דן", "אזור גוש דן", "אזור תל אביב", "אזור תל אביב וגוש דן"],
    "center-shfela": [
      "מרכז והשפלה",
      "המרכז",
      "מרכז",
      "אזור המרכז",
      "מרכז הארץ",
      "השפלה",
      "שפלה",
      "אזור השפלה",
      "אזור השפלה והמרכז",
    ],
    "jerusalem-area": ["ירושלים והסביבה", "אזור ירושלים", "אזור ירושלים והסביבה", "סביבת ירושלים"],
    "judea-samaria": ["יהודה ושומרון", 'יו"ש', "יוש", "אזור יהודה ושומרון"],
    south: ["דרום", "הדרום", "אזור הדרום", "אזור דרום", "דרום הארץ"],
  };
  const out: Record<string, RegionSlug> = {};
  for (const slug of REGION_SLUGS) {
    const variants = [REGION_DEFINITIONS[slug].label, ...raw[slug]];
    for (const phrase of variants) {
      const normalized = normalizeForInterpretation(phrase);
      if (normalized) out[normalized] = slug;
    }
  }
  return out;
})();

const LANGUAGE_CUE_TOKENS = new Set(
  normList(["דובר", "דוברת", "דוברי", "דוברות", "מדבר", "מדברת", "מדברים", "מדברות", "שפה", "שפת"]),
);
const STRUCTURED_QUERY_FILLER_TOKENS = new Set(normList(["מטפל", "מטפלים", "מטפלות", "טיפול", "פגישה", "פגישות"]));

const UNRECOGNIZED_SERVICE_PHRASES: string[] = normList([
  // These remain unsupported as canonical service/search axes.
  "מאבחן קשב",
  "אבחון קשב",
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

function* windowsUpTo(tokens: string[], maxLen: number): Iterable<{ start: number; end: number; text: string }> {
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
  | { kind: "region"; slug: RegionSlug; start: number; end: number }
  | { kind: "city"; canonical: string; start: number; end: number }
  | { kind: "delivery"; mode: string; start: number; end: number }
  | { kind: "therapyFormat"; slug: TherapyFormatSlug; start: number; end: number }
  | { kind: "name"; therapistId: string; start: number; end: number };

/** Catalog variants are normalized via the same pipeline as user input. */
const normVariant = normalizeForInterpretation;

function buildLookupIndex(catalog: Catalog): {
  professionByPhrase: Map<string, { slug: string; feminine: boolean }>;
  modalityByPhrase: Map<string, string>;
  populationByPhrase: Map<string, string>;
  languageByPhrase: Map<string, string>;
  regionByPhrase: Map<string, RegionSlug>;
  cityByPhrase: Map<string, string>;
  therapyFormatByPhrase: Map<string, TherapyFormatSlug>;
  nameByPhrase: Map<string, string>;
  maxLen: number;
} {
  const professionByPhrase = new Map<string, { slug: string; feminine: boolean }>();
  const modalityByPhrase = new Map<string, string>();
  const populationByPhrase = new Map<string, string>();
  const languageByPhrase = new Map<string, string>();
  const regionByPhrase = new Map<string, RegionSlug>();
  const cityByPhrase = new Map<string, string>();
  const therapyFormatByPhrase = new Map<string, TherapyFormatSlug>();
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
  for (const [phrase, slug] of Object.entries(REGION_QUERY_ALIASES)) {
    regionByPhrase.set(phrase, slug);
    bump(phrase);
  }
  for (const [phrase, slug] of Object.entries(THERAPY_FORMAT_ALIASES)) {
    therapyFormatByPhrase.set(phrase, slug);
    bump(phrase);
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
    if (full) {
      nameByPhrase.set(full, t.id);
      bump(full);
    }
    const first = t.tokens[0];
    if (first && catalog.firstNameCount.get(first) === 1) {
      const nf = normVariant(first);
      if (nf) nameByPhrase.set(nf, t.id);
    }
  }
  return {
    professionByPhrase,
    modalityByPhrase,
    populationByPhrase,
    languageByPhrase,
    regionByPhrase,
    cityByPhrase,
    therapyFormatByPhrase,
    nameByPhrase,
    maxLen: Math.max(maxLen, 3),
  };
}

type LookupIndex = ReturnType<typeof buildLookupIndex>;

function isBlockedHomeVisitPhrase(idx: LookupIndex, text: string, tokens: string[], end: number): boolean {
  if (DELIVERY_MODE_ALIASES[text] !== "home_visit") return false;
  const genericAtHome = new Set(normList(["טיפול בבית", "פגישה בבית"]));
  if (!genericAtHome.has(text) || end >= tokens.length) return false;

  const next = tokens[end]!;
  if (tokenPrefixVariants(next).some((variant) => NON_HOME_VISIT_FOLLOWERS.has(variant))) return true;

  // A following token may complete a real locality beginning with "בית"
  // (most importantly בית שמש). Give the city matcher the phrase instead.
  for (let len = 1; len <= 2 && end + len <= tokens.length; len++) {
    const localityTail = tokens.slice(end, end + len).join(" ");
    if (idx.cityByPhrase.has(normalizeForInterpretation(`בית ${localityTail}`))) return true;
  }
  return false;
}

function lookupPhrase(
  idx: LookupIndex,
  text: string,
  start: number,
  end: number,
  tokens: string[],
): StructuredHit | null {
  const prof = idx.professionByPhrase.get(text);
  if (prof) return { kind: "profession", slug: prof.slug, feminine: prof.feminine, start, end };
  const mod = idx.modalityByPhrase.get(text);
  if (mod) return { kind: "modality", slug: mod, start, end };
  const pop = idx.populationByPhrase.get(text);
  if (pop) return { kind: "population", slug: pop, start, end };
  const lang = idx.languageByPhrase.get(text);
  if (lang) return { kind: "language", code: lang, start, end };
  const region = idx.regionByPhrase.get(text);
  if (region) return { kind: "region", slug: region, start, end };
  const city = idx.cityByPhrase.get(text);
  if (city) return { kind: "city", canonical: city, start, end };
  const therapyFormat = idx.therapyFormatByPhrase.get(text);
  if (therapyFormat) return { kind: "therapyFormat", slug: therapyFormat, start, end };
  const name = idx.nameByPhrase.get(text);
  if (name) return { kind: "name", therapistId: name, start, end };
  const del = DELIVERY_MODE_ALIASES[text];
  if (del && !isBlockedHomeVisitPhrase(idx, text, tokens, end)) {
    return { kind: "delivery", mode: del, start, end };
  }
  return null;
}

function extractStructured(tokens: string[], idx: LookupIndex): { hits: StructuredHit[]; consumedMask: boolean[] } {
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
      hit = lookupPhrase(idx, phrase, span.start, span.end, tokens);
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
function hasImmediatePreferenceMarker(tokens: string[], hitStart: number, consumedByPrevHit: boolean[]): boolean {
  if (hitStart === 0) return false;
  const back = Math.min(4, hitStart);
  for (let k = 1; k <= back; k++) {
    const i = hitStart - k;
    if (consumedByPrevHit[i]) return false;
    if (PREFERENCE_MARKER_SET.has(tokens[i]!)) return true;
    // Multi-token markers ("אם אפשר") stay in scope across the same
    // transparent tokens (feminine profession forms, filler prefixes)
    // that single-token markers already cross: test every phrase that
    // ENDS at this backward position, not only phrases adjacent to the
    // current hit.
    for (let len = 2; len <= 3; len++) {
      const start = i - len + 1;
      if (start < 0) continue;
      if (consumedByPrevHit.slice(start, i + 1).some(Boolean)) continue;
      const phrase = tokens.slice(start, i + 1).join(" ");
      if (PREFERENCE_MARKER_SET.has(phrase)) return true;
    }
  }
  return false;
}

export type GenderMention = { index: number; gender: TherapistGender };

function genderNeutralPreferenceMask(tokens: string[]): boolean[] {
  const mask = new Array<boolean>(tokens.length).fill(false);
  for (const phrase of GENDER_NEUTRAL_PREFERENCE_PHRASES) {
    const parts = phrase.split(" ");
    for (let start = 0; start + parts.length <= tokens.length; start++) {
      if (tokens.slice(start, start + parts.length).join(" ") !== phrase) continue;
      for (let i = start; i < start + parts.length; i++) mask[i] = true;
    }
  }
  return mask;
}

/**
 * Explicit gender mentions that describe the THERAPIST.
 *
 * "מטפלת" itself is an unambiguous therapist noun. Generic gender words
 * ("אישה"/"גבר"/"זכר") require an adjacent therapist noun or canonical
 * profession phrase, so patient self-descriptions never become filters.
 */
function detectExplicitGender(
  tokens: string[],
  isProfessionPhraseAt: (start: number, end: number) => boolean,
  neutralMask: boolean[],
): { mentions: GenderMention[]; consumed: Set<number> } {
  const mentions: GenderMention[] = [];
  const consumed = new Set<number>();

  const therapistAnchorAt = (i: number): boolean => {
    if (i < 0 || i >= tokens.length) return false;
    if (THERAPIST_NOUNS.has(tokens[i]!)) return true;
    // Canonical profession phrase ending at (or starting from) i.
    for (let len = 1; len <= 3; len++) {
      if (i - len + 1 >= 0 && isProfessionPhraseAt(i - len + 1, i + 1)) return true;
      if (i + len <= tokens.length && isProfessionPhraseAt(i, i + len)) return true;
    }
    return false;
  };

  tokens.forEach((tok, i) => {
    if (neutralMask[i]) return;
    if (EXPLICIT_FEMALE_TOKENS.has(tok)) {
      // "מטפלת" itself is a therapist noun. Generic female-gender words
      // ("אישה", "נשית") need a nearby therapist/profession anchor so a
      // patient self-description never becomes a therapist-gender filter.
      const isTherapistNoun = THERAPIST_NOUNS.has(tok);
      if (!isTherapistNoun && !therapistAnchorAt(i - 1) && !therapistAnchorAt(i + 1)) return;
      mentions.push({ index: i, gender: "female" });
      consumed.add(i);
      return;
    }
    if (EXPLICIT_MALE_TOKENS.has(tok)) {
      if (!therapistAnchorAt(i - 1) && !therapistAnchorAt(i + 1)) return;
      mentions.push({ index: i, gender: "male" });
      consumed.add(i);
    }
  });

  return { mentions, consumed };
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
  hasStructured: boolean;
  hasSemantic: boolean;
  hasName: boolean;
  unresolvedPrimary: boolean;
  hasAnyToken: boolean;
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
    professionSlugs: [],
    modalitySlugs: [],
    populationSlugs: [],
    languageCodes: [],
    deliveryModes: [],
    cityNames: [],
    therapistGender: null,
    regionSlugs: [],
    therapyFormatSlugs: [],
  };
  const emptySoft: SoftPreferences = {
    professionSlugs: [],
    modalitySlugs: [],
    populationSlugs: [],
    languageCodes: [],
    cities: [],
    deliveryModes: [],
    genders: [],
  };
  if (!normalized) {
    return {
      raw,
      normalized,
      intent: "unknown",
      unresolvedPrimary: false,
      primaryHead: null,
      hardFilters: emptyHard,
      softPreferences: emptySoft,
      therapistNameIds: [],
      semanticRemainder: "",
      genderEvidence: [],
      unresolvedCodes: ["empty_query"],
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

  const isProfessionPhraseAt = (start: number, end: number): boolean => {
    if (start < 0 || end > tokens.length || end <= start) return false;
    const first = tokens[start]!;
    const tail = tokens.slice(start + 1, end);
    for (const firstVar of tokenPrefixVariants(first)) {
      const phrase = tail.length === 0 ? firstVar : `${firstVar} ${tail.join(" ")}`;
      if (idx.professionByPhrase.has(phrase)) return true;
    }
    return false;
  };
  const neutralGenderMask = genderNeutralPreferenceMask(tokens);
  const gender = detectExplicitGender(tokens, isProfessionPhraseAt, neutralGenderMask);
  for (const i of gender.consumed) consumedMask[i] = true;
  for (let i = 0; i < neutralGenderMask.length; i++) {
    if (neutralGenderMask[i]) consumedMask[i] = true;
  }

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

  // Language syntax is structural only when it is attached to a recognized
  // language hit. This removes "דוברת" / "שמדבר" / "בשפה" without ever
  // stripping the word "שפה" from unrelated semantic content such as
  // "שפה ותקשורת".
  for (const hit of hits) {
    if (hit.kind !== "language") continue;
    for (const i of [hit.start - 1, hit.start - 2]) {
      if (i < 0 || consumedMask[i]) continue;
      if (tokenPrefixVariants(tokens[i]!).some((variant) => LANGUAGE_CUE_TOKENS.has(variant))) {
        consumedMask[i] = true;
      }
    }
    // "רוסית כשפת אם" / "רוסית שפת אם".
    if (hit.end + 1 < tokens.length) {
      const first = tokenPrefixVariants(tokens[hit.end]!).some((variant) => variant === "שפת");
      const mother = normalizeForInterpretation("אם");
      const second = tokenPrefixVariants(tokens[hit.end + 1]!).some((variant) => variant === mother);
      if (first && second) {
        consumedMask[hit.end] = true;
        consumedMask[hit.end + 1] = true;
      }
    }
  }

  // Generic provider/query nouns are filler ONLY after at least one real
  // structured entity was found. They therefore cannot erase meaningful
  // free text from a purely semantic query.
  if (hits.length > 0 || gender.mentions.length > 0) {
    for (let i = 0; i < tokens.length; i++) {
      if (consumedMask[i]) continue;
      if (tokenPrefixVariants(tokens[i]!).some((variant) => STRUCTURED_QUERY_FILLER_TOKENS.has(variant))) {
        consumedMask[i] = true;
      }
    }
  }

  const hardFilters: StructuredFilters = { ...emptyHard };
  const softPreferences: SoftPreferences = {
    professionSlugs: [],
    modalitySlugs: [],
    populationSlugs: [],
    languageCodes: [],
    cities: [],
    deliveryModes: [],
    genders: [],
  };
  const therapistNameIds: string[] = [];
  const genderEvidence: GenderEvidence[] = [];
  const unresolvedCodes: UnresolvedCode[] = [];

  const uniq = <T,>(arr: T[]): T[] => Array.from(new Set(arr));

  // Spans consumed by hits that END at or before `start` — the
  // preference-marker walker must never cross into another hit's
  // territory.
  const prevHitMaskFor = (start: number): boolean[] => {
    const m = new Array<boolean>(tokens.length).fill(false);
    for (const h of hits) {
      if (h.end > start) continue;
      // A feminine profession form ("מטפלת", "פסיכולוגית") is BOTH a
      // profession hit and a gender cue. It stays transparent to the
      // preference walker so "עדיף מטפלת ב-CBT" scopes the marker over
      // the modality too, exactly as it does when the same word is only
      // a gender mention. Any other hit is opaque and ends the scope.
      if (h.kind === "profession" && h.feminine) continue;
      for (let k = h.start; k < h.end; k++) m[k] = true;
    }
    return m;
  };

  // "פסיכולוג או פסיכולוגית" (and the reverse) names one profession while
  // explicitly allowing either gender. Keep the profession constraint, but
  // do not manufacture a female-therapist preference from the feminine half.
  const neutralFeminineProfessionHits = new Set<StructuredHit>();
  const professionHits = hits.filter(
    (hit): hit is Extract<StructuredHit, { kind: "profession" }> => hit.kind === "profession",
  );
  for (const feminine of professionHits.filter((hit) => hit.feminine)) {
    for (const masculine of professionHits.filter((hit) => !hit.feminine && hit.slug === feminine.slug)) {
      const left = masculine.end <= feminine.start ? masculine : feminine;
      const right = left === masculine ? feminine : masculine;
      if (tokens.slice(left.end, right.start).join(" ") === "או") {
        neutralFeminineProfessionHits.add(feminine);
        for (let i = left.end; i < right.start; i++) consumedMask[i] = true;
      }
    }
  }

  // Gender evidence is collected first (as hard/soft candidates) so a
  // criterion claimed by a preference marker is never ALSO hard.
  let hardFemale = false;
  let hardMale = false;
  let softFemale = false;
  let softMale = false;
  const noteGender = (g: TherapistGender, preferred: boolean) => {
    if (preferred) {
      if (g === "female") softFemale = true;
      else softMale = true;
    } else if (g === "female") hardFemale = true;
    else hardMale = true;
  };

  for (const m of gender.mentions) {
    const preferred = hasImmediatePreferenceMarker(tokens, m.index, prevHitMaskFor(m.index));
    noteGender(m.gender, preferred);
    const ev: GenderEvidence = m.gender === "female" ? "explicit_female" : "explicit_male";
    if (!genderEvidence.includes(ev)) genderEvidence.push(ev);
  }

  for (const hit of hits) {
    const preferred = hasImmediatePreferenceMarker(tokens, hit.start, prevHitMaskFor(hit.start));
    switch (hit.kind) {
      case "profession":
        if (hit.feminine && !neutralFeminineProfessionHits.has(hit)) {
          noteGender("female", preferred);
          if (!genderEvidence.includes("feminine_profession_form")) genderEvidence.push("feminine_profession_form");
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
      case "region":
        // Region preferences are not a ranking dimension today, so a
        // recognized region is a deterministic hard constraint.
        (hardFilters.regionSlugs ??= []).push(hit.slug);
        break;
      case "city":
        (preferred ? softPreferences.cities : hardFilters.cityNames).push(hit.canonical);
        break;
      case "delivery":
        (preferred ? softPreferences.deliveryModes : hardFilters.deliveryModes).push(hit.mode);
        break;
      case "therapyFormat":
        // Therapy format is an explicit discovery axis, not semantic residue.
        (hardFilters.therapyFormatSlugs ??= []).push(hit.slug);
        break;
      case "name":
        therapistNameIds.push(hit.therapistId);
        break;
    }
  }

  // Gender resolution. Contradictory evidence (in ANY scope) is a
  // conflict: no hard filter, no soft preference, and a recorded code.
  const anyFemale = hardFemale || softFemale;
  const anyMale = hardMale || softMale;
  if (anyFemale && anyMale) {
    hardFilters.therapistGender = null;
    softPreferences.genders = [];
    if (!unresolvedCodes.includes("gender_conflict")) unresolvedCodes.push("gender_conflict");
  } else if (hardFemale) {
    hardFilters.therapistGender = "female";
  } else if (hardMale) {
    hardFilters.therapistGender = "male";
  } else if (softFemale) {
    softPreferences.genders.push("female");
  } else if (softMale) {
    softPreferences.genders.push("male");
  }

  hardFilters.professionSlugs = uniq(hardFilters.professionSlugs);
  hardFilters.modalitySlugs = uniq(hardFilters.modalitySlugs);
  hardFilters.populationSlugs = uniq(hardFilters.populationSlugs);
  hardFilters.languageCodes = uniq(hardFilters.languageCodes);
  hardFilters.deliveryModes = uniq(hardFilters.deliveryModes);
  hardFilters.cityNames = uniq(hardFilters.cityNames);
  hardFilters.regionSlugs = uniq(hardFilters.regionSlugs ?? []);
  hardFilters.therapyFormatSlugs = uniq(hardFilters.therapyFormatSlugs ?? []);
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
    hardFilters.cityNames.length > 0 ||
    (hardFilters.regionSlugs?.length ?? 0) > 0 ||
    (hardFilters.therapyFormatSlugs?.length ?? 0) > 0 ||
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
    hasStructured,
    hasSemantic,
    hasName,
    unresolvedPrimary,
    hasAnyToken: tokens.length > 0,
  });

  return {
    raw,
    normalized,
    intent,
    unresolvedPrimary,
    primaryHead: headForIntent || null,
    hardFilters,
    softPreferences,
    therapistNameIds,
    semanticRemainder,
    genderEvidence,
    unresolvedCodes,
  };
}

export const __internals = {
  normalizeForInterpretation,
  stripGenericPrefix,
  detectExplicitGender,
  detectUnresolvedService,
  tokenPrefixVariants,
  DELIVERY_MODE_ALIASES,
  THERAPY_FORMAT_ALIASES,
  REGION_QUERY_ALIASES,
};
