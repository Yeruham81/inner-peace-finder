import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { CANONICAL_PROBLEM_SLUGS, HOMEPAGE_PROBLEM_MAP, homepageProblemSlugs } from "./homepage-problem-map";

const POPULATION_SQL = readFileSync("supabase/migrations/20260814151000_canonical_population_slugs.sql", "utf8");

function homepageTerms(): string[] {
  const source = readFileSync("src/routes/index.tsx", "utf8");
  const explorer = source.slice(source.indexOf("const problemDomains"), source.indexOf("const popularSearches"));
  return [...explorer.matchAll(/problems:\s*\[([\s\S]*?)\]/g)].flatMap((match) =>
    [...match[1]!.matchAll(/"([^"]+)"/g)].map((value) => value[1]!),
  );
}

describe("canonical homepage ontology contract", () => {
  it("declares the complete 62-domain canonical catalog and no Legacy umbrella slugs", () => {
    expect(CANONICAL_PROBLEM_SLUGS).toHaveLength(62);
    expect(new Set(CANONICAL_PROBLEM_SLUGS).size).toBe(62);

    const declared = new Set<string>(CANONICAL_PROBLEM_SLUGS);
    for (const legacy of ["developmental", "eating_body", "neurodiversity"]) {
      expect(declared.has(legacy)).toBe(false);
    }

    for (const required of [
      "burnout",
      "career_direction",
      "eating_disorders",
      "body_image",
      "adhd",
      "autism",
      "childhood_development",
      "behavioral_challenges",
      "swallowing_feeding",
      "substance_use",
      "daily_functioning",
      "chronic_illness_adjustment",
    ]) {
      expect(declared.has(required)).toBe(true);
    }
  });

  it("maps every homepage topic and contains no stale mapping key", () => {
    const terms = new Set(homepageTerms());
    expect(terms.size).toBe(109);
    expect([...terms].filter((term) => homepageProblemSlugs(term).length === 0)).toEqual([]);
    expect(Object.keys(HOMEPAGE_PROBLEM_MAP).filter((term) => !terms.has(term))).toEqual([]);
  });

  it("maps every homepage topic only to declared canonical slugs", () => {
    const allowed = new Set<string>(CANONICAL_PROBLEM_SLUGS);
    const invalid = Object.entries(HOMEPAGE_PROBLEM_MAP).flatMap(([label, slugs]) =>
      slugs.filter((slug) => !allowed.has(slug)).map((slug) => `${label}:${slug}`),
    );
    expect(invalid).toEqual([]);

    for (const slugs of Object.values(HOMEPAGE_PROBLEM_MAP)) {
      expect(slugs.length).toBeGreaterThan(0);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("uses the new independent canonical domains for migrated homepage concepts", () => {
    expect(homepageProblemSlugs("שחיקה בעבודה")).toEqual(["burnout"]);
    expect(homepageProblemSlugs("בחירת קריירה")).toEqual(["career_direction"]);
    expect(homepageProblemSlugs("הפרעות אכילה")).toEqual(["eating_disorders"]);
    expect(homepageProblemSlugs("דימוי גוף")).toEqual(["body_image"]);
    expect(homepageProblemSlugs("עישון")).toEqual(["substance_use"]);
    expect(homepageProblemSlugs("שימוש באלכוהול")).toEqual(["substance_use"]);
    expect(homepageProblemSlugs("עיכוב התפתחותי")).toEqual(["childhood_development"]);
    expect(homepageProblemSlugs("קשיי קשב וריכוז")).toEqual(["adhd"]);
    expect(homepageProblemSlugs("התפרצויות והתנהגות מאתגרת")).toEqual(["behavioral_challenges"]);
    expect(homepageProblemSlugs("קשיי אכילה")).toEqual(["swallowing_feeding"]);
    expect(homepageProblemSlugs("ירידה בתפקוד")).toEqual(["daily_functioning"]);
    expect(homepageProblemSlugs("שינויים בריאותיים")).toEqual(["chronic_illness_adjustment"]);
  });

  it("wires curated homepage topics into the trusted unified-search problem-slug path", () => {
    const homepageSource = readFileSync("src/routes/index.tsx", "utf8");
    const searchSource = readFileSync("src/routes/search.tsx", "utf8");

    expect(homepageSource).toContain("homepageProblemSlugs(problem)");
    expect(homepageSource).toContain("problem: serializeMultiValue(problemSlugs)");

    expect(searchSource).toContain("problem: s.problem");
    expect(searchSource).toContain("problems: [...p.problemSlugs]");
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
