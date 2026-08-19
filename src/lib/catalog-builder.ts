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

import { CANONICAL_MODALITIES } from "./modality-options";
import { normalizeForInterpretation } from "./query-normalization";
import { canonicalPopulationName, canonicalPopulationSlug, populationAliasesFor } from "./population-options";
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

type ProfessionLanguageVariants = {
  /** Explicit feminine profession titles. These also provide female-gender evidence. */
  feminine?: readonly string[];
  /** Safe title synonyms/spelling variants. Do not put treatment/service phrases here. */
  aliases?: readonly string[];
};

/**
 * Natural-language coverage for the complete 72-profession canonical catalog.
 *
 * This is keyed by the stable canonical slug rather than `name_he`, so a UI
 * label wording change cannot silently delete search coverage. Every canonical
 * profession is represented here, including the few titles whose written form
 * is already gender-neutral and therefore need no separate feminine variant.
 *
 * IMPORTANT: aliases here must describe what the practitioner IS. Do not add
 * service phrases such as "טיפול רגשי", "דיקור סיני" or "פיזיותרפיה" — those
 * belong to other search axes / semantic interpretation and would otherwise
 * create false profession filters.
 */
export const PROFESSION_LANGUAGE_VARIANTS: Record<string, ProfessionLanguageVariants> = {
  "emotional-therapist": { feminine: ["מטפלת רגשית"] },
  psychotherapist: { feminine: ["פסיכותרפיסטית"] },
  "cbt-psychotherapist": {
    feminine: ["פסיכותרפיסטית קוגניטיבית-התנהגותית"],
    aliases: ["פסיכותרפיסט CBT", "פסיכותרפיסטית CBT"],
  },
  "body-psychotherapist": { feminine: ["פסיכותרפיסטית גופנית"] },
  psychoanalyst: {
    feminine: ["פסיכואנליטיקאית", "פסיכואנליסטית"],
    aliases: ["פסיכואנליסט"],
  },
  "other-therapeutic-profession": {},

  psychologist: { feminine: ["פסיכולוגית"] },
  "clinical-psychologist": { feminine: ["פסיכולוגית קלינית"] },
  "educational-psychologist": { feminine: ["פסיכולוגית חינוכית"] },
  "medical-psychologist": { feminine: ["פסיכולוגית רפואית"] },
  "rehabilitation-psychologist": { feminine: ["פסיכולוגית שיקומית"] },
  "developmental-psychologist": { feminine: ["פסיכולוגית התפתחותית"] },
  "occupational-organizational-psychologist": {
    feminine: ["פסיכולוגית תעסוקתית-ארגונית"],
  },
  psychiatrist: { feminine: ["פסיכיאטרית"] },
  "child-adolescent-psychiatrist": { feminine: ["פסיכיאטרית ילדים ונוער"] },

  "social-worker": {
    feminine: ["עובדת סוציאלית"],
    aliases: ['עו"ס', "עוס"],
  },
  "clinical-social-worker": {
    feminine: ["עובדת סוציאלית קלינית", 'עו"ס קלינית', "עוס קלינית"],
    aliases: ['עו"ס קליני', "עוס קליני"],
  },
  "couples-therapist": { feminine: ["מטפלת זוגית"] },
  "family-therapist": { feminine: ["מטפלת משפחתית"] },
  "sex-therapist": { feminine: ["מטפלת מינית"] },
  "parent-counselor": { feminine: ["מדריכת הורים"] },
  mediator: { feminine: ["מגשרת"] },

  "arts-therapist": {
    feminine: ["מטפלת באמצעות אומנויות", "מטפלת באומנויות"],
    aliases: ["מטפל באומנויות"],
  },
  "visual-art-therapist": {
    feminine: ["מטפלת באמנות חזותית", "מטפלת באמנות", "מטפלת באומנות"],
    aliases: ["מטפל באמנות", "מטפל באומנות"],
  },
  "music-therapist": { feminine: ["מטפלת במוזיקה"] },
  "dance-movement-therapist": {
    feminine: ["מטפלת בתנועה ובמחול", "מטפלת בתנועה"],
    aliases: ["מטפל בתנועה"],
  },
  "drama-therapist": { feminine: ["מטפלת בדרמה"] },
  "psychodrama-therapist": { feminine: ["מטפלת בפסיכודרמה"] },
  bibliotherapist: { feminine: ["ביבליותרפיסטית"] },
  "animal-assisted-therapist": { feminine: ["מטפלת בעזרת בעלי חיים"] },
  "horticultural-therapist": { feminine: ["מטפלת באמצעות גינון"] },

  "occupational-therapist": { feminine: ["מרפאה בעיסוק"] },
  "speech-language-pathologist": {
    feminine: ["קלינאית תקשורת", "קלינאית שפה ותקשורת"],
    aliases: ["קלינאי שפה ותקשורת"],
  },
  physiotherapist: { feminine: ["פיזיותרפיסטית"] },
  "clinical-dietitian": {
    feminine: ["דיאטנית קלינית", "תזונאית קלינית"],
    aliases: ["תזונאי קליני"],
  },
  "clinical-criminologist": { feminine: ["קרימינולוגית קלינית"] },
  "social-rehabilitation-criminologist": {
    feminine: ["קרימינולוגית חברתית-שיקומית"],
  },
  "behavior-analyst": { feminine: ["מנתחת התנהגות"] },
  hydrotherapist: { feminine: ["הידרותרפיסטית"] },

  "educational-counselor": { feminine: ["יועצת חינוכית"] },
  "didactic-diagnostician": { feminine: ["מאבחנת דידקטית"] },
  "group-facilitator": { feminine: ["מנחת קבוצות"] },
  "life-coach": {
    feminine: ["מאמנת אישית", "קואצ'רית", "קואצ׳רית"],
    aliases: ["קואצ'ר", "קואצ׳ר"],
  },
  "sleep-consultant": { feminine: ["יועצת שינה"] },
  "lactation-consultant": { feminine: ["יועצת הנקה"] },
  "career-counselor": { feminine: ["יועצת קריירה"] },
  "nutrition-consultant": { feminine: ["יועצת תזונה"] },
  doula: {},
  "adaptive-teaching-specialist": { feminine: ["מומחית להוראה מותאמת"] },
  "spiritual-care-provider": { feminine: ["מלווה רוחנית"] },

  "chinese-medicine-practitioner": { feminine: ["מטפלת ברפואה סינית"] },
  acupuncturist: { feminine: ["מדקרת", "מדקרת סינית"], aliases: ["מדקר סיני"] },
  naturopath: { feminine: ["נטורופתית"] },
  homeopath: { feminine: ["הומאופתית"] },
  "bach-flower-practitioner": { feminine: ["מטפלת בפרחי באך"] },
  aromatherapist: { feminine: ["ארומתרפיסטית"] },
  "herbal-medicine-practitioner": {
    feminine: ["מטפלת בצמחי מרפא / הרבליסטית", "מטפלת בצמחי מרפא", "הרבליסטית"],
    aliases: ["מטפל בצמחי מרפא", "הרבליסט"],
  },
  "ayurveda-practitioner": { feminine: ["מטפלת באיורוודה"] },

  reflexologist: { feminine: ["רפלקסולוגית"] },
  "shiatsu-practitioner": { feminine: ["מטפלת בשיאצו"] },
  "tuina-practitioner": { feminine: ["מטפלת בטווינא"] },
  osteopath: { feminine: ["אוסטאופתית"] },
  chiropractor: { feminine: ["כירופרקטית"] },
  "massage-therapist": {
    feminine: ["מטפלת בעיסוי", "מעסה רפואית"],
    aliases: ["מעסה", "מעסה רפואי"],
  },
  "feldenkrais-practitioner": { feminine: ["מטפלת בשיטת פלדנקרייז"] },
  "alexander-technique-teacher": { aliases: ["מורה לאלכסנדר"] },
  "paula-method-practitioner": { feminine: ["מטפלת בשיטת פאולה"] },
  "yoga-therapist": { feminine: ["מטפלת ביוגה טיפולית"] },
  "reiki-practitioner": { feminine: ["מטפלת ברייקי"] },
  "craniosacral-therapist": {
    feminine: ["מטפלת בקרניוסקרל", "מטפלת בקרניו סקראל"],
    aliases: ["מטפל בקרניו סקראל", "מטפל בקרניו-סקראל"],
  },
  "biofeedback-therapist": { feminine: ["מטפלת בביופידבק"] },
  "neurofeedback-therapist": { feminine: ["מטפלת בנוירופידבק"] },
};

/** Backwards-compatible fallback variants for legacy/non-canonical rows. */
const LEGACY_FEMININE_BY_NAME: Record<string, readonly string[]> = {
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

const LEGACY_FEMININE_BY_SLUG: Record<string, readonly string[]> = {
  therapist: ["מטפלת"],
  counselor: ["יועצת"],
  coach: ["מאמנת"],
};

export function feminineFormsFor(row: { name_he: string; slug?: string }): string[] {
  if (row.slug) {
    const canonical = PROFESSION_LANGUAGE_VARIANTS[row.slug]?.feminine;
    if (canonical) return [...canonical];
    const legacyBySlug = LEGACY_FEMININE_BY_SLUG[row.slug];
    if (legacyBySlug) return [...legacyBySlug];
  }
  return [...(LEGACY_FEMININE_BY_NAME[row.name_he.trim()] ?? [])];
}

export function professionAliasesFor(row: { slug?: string }): string[] {
  if (!row.slug) return [];
  return [...(PROFESSION_LANGUAGE_VARIANTS[row.slug]?.aliases ?? [])];
}

const CANONICAL_MODALITY_BY_SLUG = new Map(CANONICAL_MODALITIES.map((modality) => [modality.slug, modality] as const));

export function modalityAliasesFor(slug: string): readonly string[] {
  return CANONICAL_MODALITY_BY_SLUG.get(slug)?.aliases ?? [];
}

/** Hebrew/English natural-language aliases for all canonical language codes. */
export const HE_LANG_ALIASES: Record<string, string[]> = {
  he: ["עברית", "עיברית", "hebrew"],
  en: ["אנגלית", "english"],
  ar: ["ערבית", "arabic"],
  ru: ["רוסית", "russian"],
  fr: ["צרפתית", "french"],
  es: ["ספרדית", "spanish"],
  de: ["גרמנית", "german"],
  am: ["אמהרית", "amharic"],
};

function normalizedUnique(values: readonly string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const normalized = normalizeForInterpretation(value);
    if (normalized) out.add(normalized);
  }
  return [...out];
}

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
    const aliases = professionAliasesFor(p);
    return {
      id: p.id,
      slug: p.slug,
      name_he: p.name_he,
      nameVariants: normalizedUnique([p.name_he, p.name_en ?? "", p.slug, ...feminine, ...aliases]),
      feminineVariants: normalizedUnique(feminine),
    };
  });

  const modalities: Modality[] = input.modalities.map((m) => {
    const canonical = CANONICAL_MODALITY_BY_SLUG.get(m.slug);
    const aliases = modalityAliasesFor(m.slug);
    return {
      id: m.id,
      slug: m.slug,
      name_he: m.name_he,
      nameVariants: normalizedUnique([
        m.name_he,
        m.name_en ?? "",
        m.slug,
        canonical?.nameHe ?? "",
        canonical?.nameEn ?? "",
        ...aliases,
      ]),
    };
  });

  const populationMap = new Map<string, PopulationEntry>();
  for (const population of input.populations) {
    const slug = canonicalPopulationSlug(population.slug);
    const name = canonicalPopulationName(population.slug, population.name);
    const current = populationMap.get(slug);
    const aliases = normalizedUnique([
      ...(current?.aliases ?? []),
      name,
      population.name,
      slug,
      population.slug,
      ...populationAliasesFor(slug),
    ]);
    populationMap.set(slug, { slug, name_he: name, aliases });
  }
  const populations = [...populationMap.values()];

  const languages: LanguageEntry[] = input.languages.map((l) => ({
    code: l.code,
    name_he: l.name,
    aliases: normalizedUnique([l.name, l.code, ...(HE_LANG_ALIASES[l.code.toLowerCase()] ?? [])]),
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
