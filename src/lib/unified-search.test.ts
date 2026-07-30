import { describe, expect, it } from "bun:test";
import {
  computePreferenceScore,
  computeSemanticScore,
  applySemanticGate,
  rankCandidates,
  computeQualityScore,
} from "./unified-search";
import type { CandidateForRanking, SoftPreferences } from "./query-interpreter.types";

const emptySoft: SoftPreferences = {
  professionSlugs: [], modalitySlugs: [], populationSlugs: [],
  languageCodes: [], cities: [], deliveryModes: [], genders: [],
};

const base: CandidateForRanking = {
  therapistId: "x",
  professionSlugs: ["psychologist"],
  modalitySlugs: ["cbt"],
  populationSlugs: [],
  languageCodes: ["he"],
  cities: ["תל אביב"],
  deliveryModes: ["online"],
  gender: "female",
  yearsExperience: 10,
  qualityScore: 3,
  semanticScore: 0,
};

describe("computePreferenceScore", () => {
  it("returns 0 when no preferences match", () => {
    expect(computePreferenceScore(base, emptySoft)).toBe(0);
  });
  it("gives at most one point per category (0..7 model)", () => {
    const soft: SoftPreferences = {
      ...emptySoft,
      professionSlugs: ["psychologist"], modalitySlugs: ["cbt"],
      cities: ["תל אביב"], deliveryModes: ["online"], genders: ["female"],
    };
    expect(computePreferenceScore(base, soft)).toBe(5);
  });
});

describe("computeSemanticScore", () => {
  it("returns overlap count and summed confidence", () => {
    const r = computeSemanticScore(new Set(["trauma", "anxiety"]), [
      { slug: "trauma", confidence: 0.8 },
      { slug: "grief", confidence: 0.5 },
      { slug: "anxiety", confidence: 0.6 },
    ]);
    expect(r.overlapCount).toBe(2);
    expect(r.score).toBeCloseTo(1.4, 5);
  });
});

describe("applySemanticGate", () => {
  it("is a no-op when there are no signals", () => {
    const arr = [{ semanticOverlap: 0 }, { semanticOverlap: 0 }];
    expect(applySemanticGate(arr, false)).toHaveLength(2);
  });
  it("drops zero-overlap candidates when signals exist", () => {
    const arr = [{ semanticOverlap: 0 }, { semanticOverlap: 1 }];
    expect(applySemanticGate(arr, true)).toHaveLength(1);
  });
});

describe("rankCandidates", () => {
  it("orders by Tier A (semanticScore) first", () => {
    const out = rankCandidates(
      [
        { ...base, therapistId: "a", semanticScore: 0.1, qualityScore: 100 },
        { ...base, therapistId: "b", semanticScore: 0.9, qualityScore: 0 },
      ],
      emptySoft,
    );
    expect(out[0].therapistId).toBe("b");
  });
  it("falls back to Tier D (yearsExperience) when other tiers tie", () => {
    const out = rankCandidates(
      [
        { ...base, therapistId: "a", yearsExperience: 3 },
        { ...base, therapistId: "b", yearsExperience: 12 },
      ],
      emptySoft,
    );
    expect(out[0].therapistId).toBe("b");
  });
});

describe("computeQualityScore", () => {
  it("increases monotonically with verified + bio length + experience", () => {
    const low = computeQualityScore({ yearsExperience: 0, verified: false, hasImage: false, bioLength: 0 });
    const high = computeQualityScore({ yearsExperience: 20, verified: true, hasImage: true, bioLength: 800 });
    expect(high).toBeGreaterThan(low);
  });
});