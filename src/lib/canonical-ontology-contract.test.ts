import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CANONICAL_PROBLEM_SLUGS,
  HOMEPAGE_PROBLEM_MAP,
  homepageProblemSlugs,
} from "./homepage-problem-map";
import { SemanticEngine } from "./semantic-engine";
import { createFakeSupabase } from "./test-support/fake-supabase";
import { LIVE_ACTIVE_CATALOG } from "./test-support/live-catalog-snapshot";

const ONTOLOGY_SQL = readFileSync(
  "supabase/migrations/20260814150000_expand_canonical_treatment_ontology.sql",
  "utf8",
);
const POPULATION_SQL = readFileSync(
  "supabase/migrations/20260814151000_canonical_population_slugs.sql",
  "utf8",
);

function homepageTerms(): string[] {
  const source = readFileSync("src/routes/index.tsx", "utf8");
  const explorer = source.slice(
    source.indexOf("const problemDomains"),
    source.indexOf("const popularSearches"),
  );
  return [...explorer.matchAll(/problems:\s*\[([\s\S]*?)\]/g)].flatMap((match) =>
    [...match[1]!.matchAll(/"([^"]+)"/g)].map((value) => value[1]!),
  );
}

function migratedCatalogClient() {
  const problems = LIVE_ACTIVE_CATALOG.problems.map((problem) => ({
    id: problem.id,
    slug: problem.slug,
    name: problem.name_he,
    is_active: true,
  }));
  for (const [slug, name] of [
    ["sleep_difficulties", "קשיי שינה"],
    ["sexuality_intimacy", "מיניות ואינטימיות"],
    ["violence_abuse", "אלימות ומערכות יחסים פוגעניות"],
  ] as const) {
    const existing = problems.find((problem) => problem.slug === slug);
    if (existing) existing.name = name;
    else problems.push({ id: `new-${slug}`, slug, name, is_active: true });
  }
  const idBySlug = new Map(problems.map((problem) => [problem.slug, problem.id]));
  const aliasBlock = ONTOLOGY_SQL.slice(
    ONTOLOGY_SQL.indexOf("WITH candidates(slug, alias) AS ("),
    ONTOLOGY_SQL.indexOf("-- User-voice intents"),
  );
  const aliases = [...aliasBlock.matchAll(/\('([a-z_]+)',\s*'([^']+)'\)/g)].map((match) => ({
    problem_id: idBySlug.get(match[1]!)!,
    alias: match[2]!,
  }));
  const intentBlock = ONTOLOGY_SQL.slice(
    ONTOLOGY_SQL.indexOf("WITH candidates(problem_slug, intent_text) AS ("),
  );
  const intents = [...intentBlock.matchAll(/\('([a-z_]+)',\s*'([^']+)'\)/g)].map((match) => ({
    problem_slug: match[1]!,
    intent_text: match[2]!,
  }));
  return createFakeSupabase({
    problems,
    problem_aliases: [...LIVE_ACTIVE_CATALOG.aliases, ...aliases],
    problem_intents: intents,
  }) as unknown as Parameters<typeof SemanticEngine.classify>[1];
}

describe("canonical homepage ontology contract", () => {
  it("maps every homepage topic and contains no stale mapping key", () => {
    const terms = new Set(homepageTerms());
    expect(terms.size).toBe(109);
    expect([...terms].filter((term) => homepageProblemSlugs(term).length === 0)).toEqual([]);
    expect(Object.keys(HOMEPAGE_PROBLEM_MAP).filter((term) => !terms.has(term))).toEqual([]);
  });

  it("maps only declared active canonical slugs", () => {
    const allowed = new Set<string>(CANONICAL_PROBLEM_SLUGS);
    const invalid = Object.entries(HOMEPAGE_PROBLEM_MAP).flatMap(([label, slugs]) =>
      slugs.filter((slug) => !allowed.has(slug)).map((slug) => `${label}:${slug}`),
    );
    expect(invalid).toEqual([]);
  });

  it("stores every homepage label under its primary canonical owner", () => {
    for (const [label, slugs] of Object.entries(HOMEPAGE_PROBLEM_MAP)) {
      expect(ONTOLOGY_SQL).toContain(`('${slugs[0]}', '${label}')`);
    }
  });

  it("classifies all 109 homepage labels to their primary canonical owner", async () => {
    const client = migratedCatalogClient();
    for (const [label, slugs] of Object.entries(HOMEPAGE_PROBLEM_MAP)) {
      const matches = await SemanticEngine.classify(label, client);
      expect(matches[0]?.slug).toBe(slugs[0]);
      for (const slug of slugs) expect(matches.map((match) => match.slug)).toContain(slug);
    }
  });

  it("rejects generic noise and known cross-domain false positives", async () => {
    const client = migratedCatalogClient();
    for (const query of [
      "אני צריך עזרה",
      "משהו לא בסדר איתי",
      "מחפש מישהו לדבר איתו",
      "שינה",
      "שינוי",
    ]) {
      expect(await SemanticEngine.classify(query, client)).toEqual([]);
    }

    const habits = await SemanticEngine.classify("קושי בשינוי הרגלים", client);
    expect(habits.map((match) => match.slug)).toEqual(["addiction"]);
    const professionalConfidence = await SemanticEngine.classify("חוסר ביטחון מקצועי", client);
    expect(professionalConfidence.map((match) => match.slug)).toEqual(["performance_functioning"]);
  });

  it("adds the three independently searchable missing domains", () => {
    for (const slug of ["sleep_difficulties", "sexuality_intimacy", "violence_abuse"]) {
      expect(ONTOLOGY_SQL).toContain(`('${slug}'`);
    }
    expect(ONTOLOGY_SQL).toContain("ON CONFLICT (slug) DO UPDATE");
    expect(ONTOLOGY_SQL).toContain("is_active = true");
  });

  it("does not add the sleep/change false-positive alias", () => {
    expect(ONTOLOGY_SQL).not.toContain("('sleep_difficulties', 'קושי בשינה')");
    expect(ONTOLOGY_SQL).toContain("('addiction', 'קושי בשינוי הרגלים')");
  });
});

describe("canonical population migration", () => {
  it("renames legacy teen and elderly slugs and creates the complete homepage set", () => {
    expect(POPULATION_SQL).toContain("SET slug = 'adolescents'");
    expect(POPULATION_SQL).toContain("SET slug = 'older-adults'");
    for (const slug of [
      "infants",
      "children",
      "adolescents",
      "young-adults",
      "adults",
      "older-adults",
      "couples",
      "parents-families",
    ]) {
      expect(POPULATION_SQL).toContain(`('${slug}',`);
    }
  });

  it("moves legacy toddler relations before deleting the duplicate group", () => {
    expect(POPULATION_SQL).toContain("INSERT INTO public.therapist_populations");
    expect(POPULATION_SQL).toContain("UPDATE public.therapist_problems");
    expect(POPULATION_SQL).toContain("DELETE FROM public.population_groups WHERE id = source_id");
  });
});
