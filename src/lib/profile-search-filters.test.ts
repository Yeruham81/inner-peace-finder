import { describe, expect, it } from "bun:test";
import { resolveSearchContract } from "./search-contract";
import { validateExplicitFilters } from "./explicit-filters";
import type { Catalog } from "./query-interpreter.types";

const catalog: Catalog = {
  professions: [
    { id: "p1", slug: "psychologist", name_he: "פסיכולוג", nameVariants: [], feminineVariants: [] },
  ],
  modalities: [{ id: "m1", slug: "cbt", name_he: "CBT", nameVariants: [] }],
  cities: [],
  populations: [],
  languages: [],
  therapistNames: [],
  firstNameCount: new Map(),
};

describe("profile discovery search filters", () => {
  it("normalizes multi-value and one-click filters into one canonical contract", () => {
    const result = resolveSearchContract({
      professions: "psychologist,psychologist",
      modalities: ["cbt"],
      therapyFormats: "group,individual,group",
      gender: "female",
      accessible: "1",
      verified: true,
      lgbtqAffirming: "true",
      freeIntro: "1",
    });
    expect(result.professionSlugs).toEqual(["psychologist"]);
    expect(result.modalitySlugs).toEqual(["cbt"]);
    expect(result.therapyFormats).toEqual(["individual", "group"]);
    expect(result.gender).toBe("female");
    expect([result.accessible, result.verified, result.lgbtqAffirming, result.freeIntro]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("validates catalog-backed filters and rejects unknown slugs", () => {
    const result = validateExplicitFilters(
      {
        professions: "psychologist,unknown",
        modalities: "cbt,other",
        therapyFormats: "family,bad",
        gender: "female",
        accessible: true,
      },
      catalog,
    );
    expect(result.professionSlugs).toEqual(["psychologist"]);
    expect(result.modalitySlugs).toEqual(["cbt"]);
    expect(result.therapyFormatSlugs).toEqual(["family"]);
    expect(result.therapistGender).toBe("female");
    expect(result.accessibleClinic).toBe(true);
    expect(result.rejected.map((item) => item.category)).toEqual([
      "profession",
      "modality",
      "therapyFormat",
    ]);
  });
});
