import { describe, expect, it } from "bun:test";
import {
  exactEvidenceToSignals,
  findExactCanonicalEvidence,
  hasWholeRemainderExactEvidence,
  mergeAuthoritativeSemanticSignals,
} from "./canonical-semantic-evidence";
import { LIVE_ACTIVE_CATALOG } from "./test-support/live-catalog-snapshot";

const catalog = [
  { slug: "anxiety", name: "חרדה ופחדים", aliases: ["חרדה", "פחד מתמשך"] },
  { slug: "sleep_difficulties", name: "קשיי שינה", aliases: ["נדודי שינה"] },
  { slug: "relationships", name: "זוגיות והיקשרות", aliases: ["קושי בזוגיות"] },
];

describe("exact canonical semantic evidence", () => {
  it("uses complete normalized phrases only — no fuzzy token overlap", () => {
    expect(
      findExactCanonicalEvidence("אני מחפש עזרה עם נדודי שינה", catalog).map((x) => x.slug),
    ).toEqual(["sleep_difficulties"]);
    expect(findExactCanonicalEvidence("יש לי שינה לא טובה", catalog)).toEqual([]);
  });

  it("recognizes a whole-remainder exact alias so the LLM can be skipped", () => {
    const evidence = findExactCanonicalEvidence("חרדה", catalog);
    expect(hasWholeRemainderExactEvidence("חרדה", evidence)).toBe(true);
    expect(exactEvidenceToSignals(evidence)).toEqual([{ slug: "anxiety", confidence: 1 }]);
  });

  it("maps every one of the 483 curated live aliases to its canonical owner with exact evidence", () => {
    const aliasesById = new Map<string, string[]>();
    for (const row of LIVE_ACTIVE_CATALOG.aliases) {
      const list = aliasesById.get(String(row.problem_id)) ?? [];
      list.push(row.alias);
      aliasesById.set(String(row.problem_id), list);
    }
    const liveCatalog = LIVE_ACTIVE_CATALOG.problems.map((problem) => ({
      slug: problem.slug,
      name: problem.name_he,
      aliases: aliasesById.get(String(problem.id)) ?? [],
    }));
    const slugById = new Map(
      LIVE_ACTIVE_CATALOG.problems.map((problem) => [String(problem.id), problem.slug]),
    );

    expect(liveCatalog).toHaveLength(62);
    expect(LIVE_ACTIVE_CATALOG.aliases).toHaveLength(483);
    for (const row of LIVE_ACTIVE_CATALOG.aliases) {
      const expected = slugById.get(String(row.problem_id));
      expect(findExactCanonicalEvidence(row.alias, liveCatalog).map((hit) => hit.slug)).toEqual([
        expected,
      ]);
    }
  });

  it("prefers a longer specific alias over a nested shorter alias", () => {
    const nestedCatalog = [
      { slug: "trauma", name: "טראומה ופוסט־טראומה", aliases: ["טראומה"] },
      {
        slug: "sexual_abuse_trauma",
        name: "פגיעות מיניות וטראומה מינית",
        aliases: ["טראומה מינית"],
      },
    ];
    expect(
      findExactCanonicalEvidence("טראומה מינית", nestedCatalog).map((hit) => hit.slug),
    ).toEqual(["sexual_abuse_trauma"]);
  });

  it("keeps separate exact phrases as independent deterministic evidence", () => {
    const separateCatalog = [
      { slug: "anxiety", name: "חרדה ופחדים", aliases: ["חרדה"] },
      { slug: "depression", name: "דיכאון ומצב רוח ירוד", aliases: ["דיכאון"] },
    ];
    expect(
      findExactCanonicalEvidence("חרדה וגם דיכאון", separateCatalog)
        .map((hit) => hit.slug)
        .sort(),
    ).toEqual(["anxiety", "depression"]);
  });

  it("locks exact evidence ahead of conflicting probabilistic signals", () => {
    expect(
      mergeAuthoritativeSemanticSignals(
        [{ slug: "anxiety", confidence: 1 }],
        [
          { slug: "relationships", confidence: 0.98 },
          { slug: "anxiety", confidence: 0.2 },
        ],
      ),
    ).toEqual([
      { slug: "anxiety", confidence: 1 },
      { slug: "relationships", confidence: 0.98 },
    ]);
  });
});
