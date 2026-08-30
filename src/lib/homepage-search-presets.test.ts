import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { HOMEPAGE_SEARCH_PRESETS } from "./homepage-search-presets";
import { CANONICAL_PROBLEM_SLUGS } from "./homepage-problem-map";
import { CANONICAL_LANGUAGE_CODES } from "./language-options";
import { REGION_SLUGS } from "./locality-options";
import { SERVICE_TYPES, THERAPIST_GENDERS, THERAPY_FORMAT_SLUGS, resolveSearchContract } from "./search-contract";

const expected = new Map([
  ["טיפול בחרדה חברתית לבני נוער", { problemSlugs: ["anxiety"], population: "adolescents" }],
  ["טיפול זוגי באזור השרון", { regions: ["sharon"], therapyFormats: ["couples"] }],
  [
    "קלינאית תקשורת לפעוטות בפתח תקווה",
    {
      city: "פתח תקווה",
      population: "infants",
      professionSlugs: ["speech-language-pathologist"],
    },
  ],
  [
    "פסיכולוג ילדים לקשב וריכוז בתל אביב",
    {
      problemSlugs: ["adhd"],
      city: "תל אביב",
      population: "children",
      professionSlugs: ["psychologist"],
    },
  ],
  [
    "טיפול אונליין בדיכאון בעברית",
    {
      problemSlugs: ["depression"],
      languages: ["he"],
      serviceTypes: ["online"],
    },
  ],
  ["טיפול בטראומה באזור ירושלים", { problemSlugs: ["trauma"], regions: ["jerusalem-area"] }],
  [
    "פסיכולוגית דוברת רוסית באזור חיפה",
    {
      languages: ["ru"],
      regions: ["haifa-krayot"],
      professionSlugs: ["psychologist"],
      gender: "female",
    },
  ],
  [
    "הדרכת הורים להתפרצויות זעם",
    {
      problemSlugs: ["emotional_regulation"],
      therapyFormats: ["parent_guidance"],
    },
  ],
]);

describe("homepage curated search presets", () => {
  it("defines exactly the eight visible example searches once each", () => {
    expect(HOMEPAGE_SEARCH_PRESETS).toHaveLength(8);
    expect(new Set(HOMEPAGE_SEARCH_PRESETS.map((preset) => preset.label)).size).toBe(8);
    expect(new Set(HOMEPAGE_SEARCH_PRESETS.map((preset) => preset.label))).toEqual(new Set(expected.keys()));
  });

  it("never carries free text, so example-search clicks cannot create an LLM semantic remainder", () => {
    for (const preset of HOMEPAGE_SEARCH_PRESETS) {
      expect("q" in preset.search, preset.label).toBe(false);
    }
  });

  it("resolves every example to its exact intended canonical search contract", () => {
    for (const preset of HOMEPAGE_SEARCH_PRESETS) {
      const contract = resolveSearchContract(preset.search);
      const wanted = expected.get(preset.label);
      expect(wanted, preset.label).toBeDefined();
      expect(contract, preset.label).toMatchObject(wanted!);
    }
  });

  it("uses only declared canonical problem/language/region/service/format/gender values", () => {
    const problems = new Set<string>(CANONICAL_PROBLEM_SLUGS);
    const languages = new Set<string>(CANONICAL_LANGUAGE_CODES);
    const regions = new Set<string>(REGION_SLUGS);
    const services = new Set<string>(SERVICE_TYPES);
    const formats = new Set<string>(THERAPY_FORMAT_SLUGS);
    const genders = new Set<string>(THERAPIST_GENDERS);

    for (const preset of HOMEPAGE_SEARCH_PRESETS) {
      const contract = resolveSearchContract(preset.search);
      expect(
        contract.problemSlugs.every((slug) => problems.has(slug)),
        preset.label,
      ).toBe(true);
      expect(
        contract.languages.every((code) => languages.has(code)),
        preset.label,
      ).toBe(true);
      expect(
        contract.regions.every((slug) => regions.has(slug)),
        preset.label,
      ).toBe(true);
      expect(
        contract.serviceTypes.every((value) => services.has(value)),
        preset.label,
      ).toBe(true);
      expect(
        contract.therapyFormats.every((slug) => formats.has(slug)),
        preset.label,
      ).toBe(true);
      expect(!contract.gender || genders.has(contract.gender), preset.label).toBe(true);
    }
  });

  it("wires the homepage buttons directly to preset.search instead of q=label", () => {
    const source = readFileSync("src/routes/index.tsx", "utf8");
    expect(source).toContain("const popularSearches = HOMEPAGE_SEARCH_PRESETS");
    expect(source).toContain("search: preset.search");
    expect(source).not.toContain("search: { q: query }");
  });
});

describe("homepage topic/population LLM bypass guard", () => {
  it("keeps every explorer click on the trusted canonical problem-slug path", () => {
    const homepageSource = readFileSync("src/routes/index.tsx", "utf8");
    expect(homepageSource).toContain("const problemSlugs = homepageProblemSlugs(problem)");
    expect(homepageSource).toContain("problem: serializeMultiValue(problemSlugs)");
    expect(homepageSource).not.toContain("q: problem");
  });

  it("keeps the LLM classifier disabled whenever a curated problem parameter was supplied", () => {
    const serverSource = readFileSync("src/lib/query-interpreter.functions.ts", "utf8");
    const classifierIndex = serverSource.indexOf("classifyUnifiedSemanticRemainder");
    expect(classifierIndex).toBeGreaterThan(0);

    const guardWindow = serverSource.slice(Math.max(0, classifierIndex - 900), classifierIndex);
    expect(guardWindow).toContain("!hasRequestedProblem");
  });
});
