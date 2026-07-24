/**
 * Phase Q1 v4 — pure query interpreter.
 * Deterministic, side-effect free. Uses a preloaded Catalog only.
 */

import {
  foldSofit,
  lightNormalizeHebrew,
  stripHebrewPrefix,
  tokenizeHebrew,
} from "./hebrew-normalizer";
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

const GENERIC_PREFIXES: string[] = [
  "אני מחפש את", "אני מחפש", "אני מחפשת",
  "אני צריך", "אני צריכה",
  "אשמח לקבל", "אשמח למצוא",
  "רוצה למצוא", "רוצה לפגוש", "אני רוצה",
  "אפשר לקבל", "יש לכם", "יש לך",
  "מחפש", "מחפשת", "צריך", "צריכה", "רוצה",
  "מעוניין ב", "מעוניינת ב", "מעוניין", "מעוניינת",
];

const PREFERENCE_MARKERS: string[] = ["עדיף", "רצוי", "אם אפשר", "כדאי"];
const EXPLICIT_FEMALE_TOKENS = new Set(["אישה", "אשה", "נשית", "מטפלת"]);
const EXPLICIT_MALE_TOKENS = new Set(["גבר", "זכר"]);

const DELIVERY_MODE_ALIASES: Record<string, string> = {
  אונליין: "online", אונלין: "online", זום: "online",
  מקוון: "online", מקוונת: "online", מרחוק: "online",
  פרונטלי: "in_person", בקליניקה: "in_person",
};

const UNRECOGNIZED_SERVICE_PHRASES: string[] = [
  "מאבחן קשב", "אבחון קשב", "אבחון adhd",
  "אבחון אוטיזם", "אבחון",
];

function normalize(raw: string): string {
  return lightNormalizeHebrew(raw).toLowerCase();
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

function tokenBag(text: string): string[] {
  return tokenizeHebrew(text).map((t) => foldSofit(t.toLowerCase()));
}

function tokenBagWithPrefixStripped(text: string): string[] {
  return tokenBag(text).map((t) => stripHebrewPrefix(t));
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

function normVariant(v: string): string {
  return foldSofit(v.toLowerCase().trim());
}

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
    const full = t.tokens.join(" ");
    if (full) { nameByPhrase.set(full, t.id); bump(full); }
    const first = t.tokens[0];
    if (first && catalog.firstNameCount.get(first) === 1) {
      nameByPhrase.set(first, t.id);
    }
  }
  return {
    professionByPhrase, modalityByPhrase, populationByPhrase,
    languageByPhrase, cityByPhrase, nameByPhrase,
    maxLen: Math.max(maxLen, 3),
  };
}

function extractStructured(
  tokens: string[],
  idx: ReturnType<typeof buildLookupIndex>,
): { hits: StructuredHit[]; consumedMask: boolean[] } {
  const consumedMask = new Array<boolean>(tokens.length).fill(false);
  const hits: StructuredHit[] = [];
  const spans = Array.from(windowsUpTo(tokens, idx.maxLen));
  spans.sort((a, b) => b.end - b.start - (a.end - a.start));
  for (const span of spans) {
    if (consumedMask.slice(span.start, span.end).some(Boolean)) continue;
    const { text } = span;
    let hit: StructuredHit | null = null;
    const prof = idx.professionByPhrase.get(text);
    if (prof) hit = { kind: "profession", slug: prof.slug, feminine: prof.feminine, start: span.start, end: span.end };
    else if (idx.modalityByPhrase.has(text)) hit = { kind: "modality", slug: idx.modalityByPhrase.get(text)!, start: span.start, end: span.end };
    else if (idx.populationByPhrase.has(text)) hit = { kind: "population", slug: idx.populationByPhrase.get(text)!, start: span.start, end: span.end };
    else if (idx.languageByPhrase.has(text)) hit = { kind: "language", code: idx.languageByPhrase.get(text)!, start: span.start, end: span.end };
    else if (idx.cityByPhrase.has(text)) hit = { kind: "city", canonical: idx.cityByPhrase.get(text)!, start: span.start, end: span.end };
    else if (idx.nameByPhrase.has(text)) hit = { kind: "name", therapistId: idx.nameByPhrase.get(text)!, start: span.start, end: span.end };
    else if (DELIVERY_MODE_ALIASES[text]) hit = { kind: "delivery", mode: DELIVERY_MODE_ALIASES[text], start: span.start, end: span.end };
    if (hit) {
      hits.push(hit);
      for (let i = span.start; i < span.end; i++) consumedMask[i] = true;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return { hits, consumedMask };
}

function hasImmediatePreferenceMarker(tokens: string[], hitStart: number): boolean {
  if (hitStart === 0) return false;
  if (PREFERENCE_MARKERS.includes(tokens[hitStart - 1])) return true;
  if (hitStart >= 2 && PREFERENCE_MARKERS.includes(tokens.slice(hitStart - 2, hitStart).join(" "))) return true;
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
  const normalized = normalize(raw);
  const emptyHard: StructuredFilters = {
    professionSlugs: [], modalitySlugs: [], populationSlugs: [],
    languageCodes: [], city: null, therapistGender: null,
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

  const rawTokens = tokenBag(normalized);
  const tokens = tokenBagWithPrefixStripped(normalized);
  const idx = buildLookupIndex(catalog);
  const { hits, consumedMask } = extractStructured(tokens, idx);

  const gender = detectExplicitGender(rawTokens);
  for (const i of gender.consumed) consumedMask[i] = true;

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

  for (const hit of hits) {
    const preferred = hasImmediatePreferenceMarker(tokens, hit.start);
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
        softPreferences.deliveryModes.push(hit.mode);
        break;
      case "name":
        therapistNameIds.push(hit.therapistId);
        break;
    }
  }

  if (gender.hard && !hardFilters.therapistGender) hardFilters.therapistGender = gender.hard;

  hardFilters.professionSlugs = uniq(hardFilters.professionSlugs);
  hardFilters.modalitySlugs = uniq(hardFilters.modalitySlugs);
  hardFilters.populationSlugs = uniq(hardFilters.populationSlugs);
  hardFilters.languageCodes = uniq(hardFilters.languageCodes);
  softPreferences.professionSlugs = uniq(softPreferences.professionSlugs);
  softPreferences.modalitySlugs = uniq(softPreferences.modalitySlugs);
  softPreferences.populationSlugs = uniq(softPreferences.populationSlugs);
  softPreferences.languageCodes = uniq(softPreferences.languageCodes);
  softPreferences.cities = uniq(softPreferences.cities);
  softPreferences.deliveryModes = uniq(softPreferences.deliveryModes);
  softPreferences.genders = uniq(softPreferences.genders);

  const remainderTokens = rawTokens.filter((_t, i) => !consumedMask[i]);
  const semanticRemainder = remainderTokens.join(" ");

  const hasStructured =
    hardFilters.professionSlugs.length > 0 ||
    hardFilters.modalitySlugs.length > 0 ||
    hardFilters.populationSlugs.length > 0 ||
    hardFilters.languageCodes.length > 0 ||
    hardFilters.city !== null ||
    hardFilters.therapistGender !== null;
  const hasName = therapistNameIds.length > 0;
  const hasSemantic = remainderTokens.length > 0;
  const unresolvedPrimary = Boolean(unresolvedPhrase) && !hasStructured && !hasName;
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

export const __internals = { stripGenericPrefix, detectExplicitGenderRaw, detectUnresolvedService };