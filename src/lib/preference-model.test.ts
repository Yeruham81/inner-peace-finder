/**
 * The approved 0–7 soft-preference model: seven categories, each worth at
 * most one point, no per-category weights.
 */

import { describe, expect, it } from "bun:test";
import { computePreferenceScore, MAX_PREFERENCE_SCORE } from "./unified-search";
import type { CandidateForRanking, SoftPreferences } from "./query-interpreter.types";

const candidate: CandidateForRanking = {
  therapistId: "t1",
  professionSlugs: ["psychologist"],
  modalitySlugs: ["cbt", "psychodynamic"],
  populationSlugs: ["children"],
  languageCodes: ["ru", "he"],
  cities: ["חיפה"],
  deliveryModes: ["online"],
  gender: "female",
  yearsExperience: 5,
  qualityScore: 3,
  semanticScore: 0,
};

const empty: SoftPreferences = {
  professionSlugs: [],
  modalitySlugs: [],
  populationSlugs: [],
  languageCodes: [],
  cities: [],
  deliveryModes: [],
  genders: [],
};

describe("computePreferenceScore — 0–7 model", () => {
  it("a full seven-category match scores exactly 7", () => {
    const soft: SoftPreferences = {
      professionSlugs: ["psychologist"],
      modalitySlugs: ["cbt"],
      populationSlugs: ["children"],
      languageCodes: ["ru"],
      cities: ["חיפה"],
      deliveryModes: ["online"],
      genders: ["female"],
    };
    expect(computePreferenceScore(candidate, soft)).toBe(7);
    expect(MAX_PREFERENCE_SCORE).toBe(7);
  });

  it("multiple preferred languages still contribute at most 1", () => {
    expect(computePreferenceScore(candidate, { ...empty, languageCodes: ["ru", "he"] })).toBe(1);
  });

  it("multiple preferred modalities still contribute at most 1", () => {
    expect(
      computePreferenceScore(candidate, { ...empty, modalitySlugs: ["cbt", "psychodynamic"] }),
    ).toBe(1);
  });

  it("a candidate matching no soft preference scores 0 and stays eligible", () => {
    const soft: SoftPreferences = { ...empty, cities: ["ירושלים"], genders: ["male"] };
    expect(computePreferenceScore(candidate, soft)).toBe(0);
  });

  it("no category outweighs another — each single-category match scores 1", () => {
    const singles: SoftPreferences[] = [
      { ...empty, professionSlugs: ["psychologist"] },
      { ...empty, modalitySlugs: ["cbt"] },
      { ...empty, populationSlugs: ["children"] },
      { ...empty, languageCodes: ["ru"] },
      { ...empty, cities: ["חיפה"] },
      { ...empty, deliveryModes: ["online"] },
      { ...empty, genders: ["female"] },
    ];
    for (const s of singles) expect(computePreferenceScore(candidate, s)).toBe(1);
  });

  it("score never exceeds MAX_PREFERENCE_SCORE even with every value listed", () => {
    const soft: SoftPreferences = {
      professionSlugs: ["psychologist", "psychiatrist"],
      modalitySlugs: ["cbt", "psychodynamic"],
      populationSlugs: ["children", "adults"],
      languageCodes: ["ru", "he", "en"],
      cities: ["חיפה", "תל אביב"],
      deliveryModes: ["online", "clinic"],
      genders: ["female", "male"],
    };
    expect(computePreferenceScore(candidate, soft)).toBe(MAX_PREFERENCE_SCORE);
  });
});
