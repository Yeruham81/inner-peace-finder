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
