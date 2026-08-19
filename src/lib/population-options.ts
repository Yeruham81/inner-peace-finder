/** Canonical population slugs and Hebrew UI labels. */
export const CANONICAL_POPULATIONS = [
  { slug: "infants", name: "תינוקות ופעוטות", legacySlugs: ["toddlers", "babies-toddlers"] },
  { slug: "children", name: "ילדים", legacySlugs: [] },
  { slug: "adolescents", name: "בני נוער", legacySlugs: ["teens"] },
  { slug: "young-adults", name: "צעירים", legacySlugs: [] },
  { slug: "adults", name: "מבוגרים", legacySlugs: [] },
  { slug: "older-adults", name: "הגיל השלישי", legacySlugs: ["elderly"] },
  { slug: "couples", name: "זוגות", legacySlugs: [] },
  { slug: "parents-families", name: "הורים ומשפחות", legacySlugs: [] },
] as const;

export type CanonicalPopulationSlug = (typeof CANONICAL_POPULATIONS)[number]["slug"];

/**
 * Natural-language variants that are safe to interpret as a population.
 *
 * Keep this list deliberately conservative. In particular, do not add family
 * relation words such as "אמא" / "אבא": in a query like "אמא שלי בדיכאון"
 * those words describe the person being discussed and must not silently force
 * the `parents-families` therapist-population filter.
 */
export const CANONICAL_POPULATION_ALIASES: Record<CanonicalPopulationSlug, readonly string[]> = {
  infants: ["תינוק", "תינוקת", "תינוקות", "פעוט", "פעוטה", "פעוטות", "הגיל הרך", "ילדי הגיל הרך"],
  children: ["ילד", "ילדה", "ילדים", "ילדות"],
  adolescents: ["נער", "נערה", "נערים", "נערות", "נוער", "בני נוער", "מתבגר", "מתבגרת", "מתבגרים", "מתבגרות"],
  "young-adults": ["צעיר", "צעירה", "צעירים", "צעירות", "בוגר צעיר", "בוגרת צעירה", "בוגרים צעירים", "בוגרות צעירות"],
  adults: ["מבוגר", "מבוגרת", "מבוגרים", "מבוגרות"],
  "older-adults": ["הגיל השלישי", "גיל שלישי", "קשיש", "קשישה", "קשישים", "קשישות"],
  couples: ["זוג", "זוגות", "בני זוג", "בנות זוג"],
  "parents-families": ["הורה", "הורים", "משפחה", "משפחות", "הורים ומשפחות"],
};

const byAnySlug = new Map<string, (typeof CANONICAL_POPULATIONS)[number]>();
for (const population of CANONICAL_POPULATIONS) {
  byAnySlug.set(population.slug, population);
  for (const legacy of population.legacySlugs) byAnySlug.set(legacy, population);
}

export function canonicalPopulationSlug(slug: string): string {
  return byAnySlug.get(slug)?.slug ?? slug;
}

export function canonicalPopulationName(slug: string, fallback?: string): string {
  return byAnySlug.get(slug)?.name ?? fallback ?? slug;
}

export function populationAliasesFor(slug: string): readonly string[] {
  const canonical = canonicalPopulationSlug(slug) as CanonicalPopulationSlug;
  return CANONICAL_POPULATION_ALIASES[canonical] ?? [];
}

export function buildPopulationOptions(rows: Array<{ slug: string; name: string }>): Array<{
  value: string;
  label: string;
}> {
  const options = new Map<string, string>();
  for (const population of CANONICAL_POPULATIONS) {
    options.set(population.slug, population.name);
  }
  for (const row of rows) {
    const value = canonicalPopulationSlug(row.slug);
    options.set(value, canonicalPopulationName(row.slug, row.name));
  }
  return [...options].map(([value, label]) => ({ value, label }));
}
