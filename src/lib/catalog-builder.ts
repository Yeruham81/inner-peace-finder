/**
 * Phase Q1 — the PRODUCTION catalog builder.
 *
 * Pure: takes database-shaped rows and returns the `Catalog` the
 * interpreter consumes. `query-catalog.ts` is a thin Supabase reader that
 * delegates here, so tests can exercise the exact production catalog
 * construction without a database.
 *
 * Normalization goes through `normalizeForInterpretation` — the SAME
 * contract used for user query input. There is no separate
 * inflection-folding pipeline for catalog names.
 */

import { normalizeForInterpretation } from "./query-normalization";
import { canonicalPopulationName, canonicalPopulationSlug } from "./population-options";
import type {
  Catalog,
  CityEntry,
  LanguageEntry,
  Modality,
  PopulationEntry,
  Profession,
  TherapistNameEntry,
} from "./query-interpreter.types";

export type ProfessionRow = {
  id: string;
  slug: string;
  name_he: string;
  name_en?: string | null;
};
export type ModalityRow = {
  id: string;
  slug: string;
  name_he: string;
  name_en?: string | null;
};
export type PopulationRow = { slug: string; name: string };
export type LanguageRow = { code: string; name: string };
export type CityRow = { city: string | null };
export type TherapistNameRow = { id: string; full_name: string };

export const CITY_ALIASES: Record<string, string[]> = {
  "תל אביב": ['ת"א', "תא", "תל-אביב", "tel aviv", "telaviv"],
  "תל אביב-יפו": ["תל אביב יפו", "יפו"],
  ירושלים: ["jerusalem"],
  חיפה: ["haifa"],
  "באר שבע": ['ב"ש', "beersheba", "beer sheva"],
  "פתח תקווה": ['פ"ת', "פתח תקוה"],
  "ראשון לציון": ['ראשל"צ'],
};

/**
 * Explicit, curated feminine forms for supported canonical professions.
 *
 * A generic suffix heuristic produces invalid Hebrew (e.g. "עובד סוציאלי"
 * → "עובד סוציאלית"), so supported forms are listed by hand. Keys are the
 * canonical `name_he`; slugs are accepted as a secondary key.
 */
export const FEMININE_PROFESSION_FORMS: Record<string, string[]> = {
  מטפל: ["מטפלת"],
  פסיכולוג: ["פסיכולוגית"],
  "פסיכולוג קליני": ["פסיכולוגית קלינית"],
  "פסיכולוג חינוכי": ["פסיכולוגית חינוכית"],
  "פסיכולוג התפתחותי": ["פסיכולוגית התפתחותית"],
  "פסיכולוג שיקומי": ["פסיכולוגית שיקומית"],
  פסיכיאטר: ["פסיכיאטרית"],
  פסיכותרפיסט: ["פסיכותרפיסטית"],
  "עובד סוציאלי": ["עובדת סוציאלית"],
  יועץ: ["יועצת"],
  "יועץ חינוכי": ["יועצת חינוכית"],
  מאמן: ["מאמנת"],
  "מטפל באמנות": ["מטפלת באמנות"],
  "מטפל זוגי": ["מטפלת זוגית"],
  "מטפל משפחתי": ["מטפלת משפחתית"],
  דיאטן: ["דיאטנית"],
};

const FEMININE_BY_SLUG: Record<string, string[]> = {
  therapist: ["מטפלת"],
  psychologist: ["פסיכולוגית"],
  psychiatrist: ["פסיכיאטרית"],
  "social-worker": ["עובדת סוציאלית"],
  social_worker: ["עובדת סוציאלית"],
  psychotherapist: ["פסיכותרפיסטית"],
  counselor: ["יועצת"],
  coach: ["מאמנת"],
};

export function feminineFormsFor(row: { name_he: string; slug?: string }): string[] {
  const byName = FEMININE_PROFESSION_FORMS[row.name_he.trim()];
  if (byName) return byName;
  const bySlug = row.slug ? FEMININE_BY_SLUG[row.slug] : undefined;
  return bySlug ?? [];
}

/** Minimal Hebrew aliases for the most common language codes. */
export const HE_LANG_ALIASES: Record<string, string[]> = {
  he: ["עברית", "עיברית"],
  en: ["אנגלית", "english"],
  ru: ["רוסית", "russian"],
  ar: ["ערבית", "arabic"],
  fr: ["צרפתית", "french"],
  es: ["ספרדית", "spanish"],
  am: ["אמהרית"],
};

export function buildSearchCatalog(input: {
  professions: ProfessionRow[];
  modalities: ModalityRow[];
  populations: PopulationRow[];
  languages: LanguageRow[];
  cities: CityRow[];
  therapistNames: TherapistNameRow[];
}): Catalog {
  const nv = normalizeForInterpretation;

  const professions: Profession[] = input.professions.map((p) => {
    const feminine = feminineFormsFor(p);
    const variants = new Set<string>();
    for (const v of [p.name_he, p.name_en ?? "", p.slug, ...feminine]) {
      const n = nv(v);
      if (n) variants.add(n);
    }
    return {
      id: p.id,
      slug: p.slug,
      name_he: p.name_he,
      nameVariants: Array.from(variants),
      feminineVariants: feminine.map(nv).filter(Boolean),
    };
  });

  const modalities: Modality[] = input.modalities.map((m) => {
    const variants = new Set<string>();
    for (const v of [m.name_he, m.name_en ?? "", m.slug]) {
      const n = nv(v);
      if (n) variants.add(n);
    }
    return { id: m.id, slug: m.slug, name_he: m.name_he, nameVariants: Array.from(variants) };
  });

  const populationMap = new Map<string, PopulationEntry>();
  for (const population of input.populations) {
    const slug = canonicalPopulationSlug(population.slug);
    const name = canonicalPopulationName(population.slug, population.name);
    const current = populationMap.get(slug);
    const aliases = new Set(current?.aliases ?? []);
    for (const alias of [name, population.name, slug, population.slug]) aliases.add(alias);
    populationMap.set(slug, { slug, name_he: name, aliases: [...aliases] });
  }
  const populations = [...populationMap.values()];

  const languages: LanguageEntry[] = input.languages.map((l) => ({
    code: l.code,
    name_he: l.name,
    aliases: [l.name, l.code, ...(HE_LANG_ALIASES[l.code.toLowerCase()] ?? [])],
  }));

  const cityMap = new Map<string, CityEntry>();
  for (const row of input.cities) {
    if (!row.city) continue;
    const canonical = row.city.trim();
    if (!canonical || cityMap.has(canonical)) continue;
    const aliases = new Set<string>([nv(canonical)]);
    for (const a of CITY_ALIASES[canonical] ?? []) {
      const n = nv(a);
      if (n) aliases.add(n);
    }
    cityMap.set(canonical, { canonical, aliases: Array.from(aliases) });
  }

  const therapistNames: TherapistNameEntry[] = [];
  const firstNameCount = new Map<string, number>();
  for (const t of input.therapistNames) {
    const tokens = nv(t.full_name).split(" ").filter(Boolean);
    if (tokens.length === 0) continue;
    therapistNames.push({ id: t.id, fullName: t.full_name, tokens });
    firstNameCount.set(tokens[0]!, (firstNameCount.get(tokens[0]!) ?? 0) + 1);
  }

  return {
    professions,
    modalities,
    populations,
    languages,
    cities: Array.from(cityMap.values()),
    therapistNames,
    firstNameCount,
  };
}
