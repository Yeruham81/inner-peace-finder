/**
 * The canonical explicit-search contract: one filter selection must always
 * produce exactly one URL shape, and unknown values must be rejected rather
 * than silently reinterpreted.
 */

import { describe, expect, it } from "bun:test";
import {
  normalizeLanguagesParam,
  normalizeLegacyCityParam,
  normalizeRegionsParam,
  normalizeServiceTypesParam,
  resolveSearchContract,
  serializeMultiValue,
  SERVICE_TYPES,
} from "./search-contract";

describe("service types", () => {
  it("exposes exactly the three real location_type values the editor produces", () => {
    expect([...SERVICE_TYPES]).toEqual(["clinic", "online", "home_visit"]);
  });

  it("rejects the removed group option and UI-only spellings", () => {
    const out = normalizeServiceTypesParam("group,home-visit,clinic");
    expect(out.values).toEqual(["clinic"]);
    expect(out.rejected).toEqual(["group", "home-visit"]);
  });
});

describe("multi-value normalization", () => {
  it("dedupes and sorts into canonical order regardless of input order", () => {
    const a = normalizeRegionsParam("south,north,south");
    const b = normalizeRegionsParam(["north", "south"]);
    expect(a.values).toEqual(b.values);
    expect(serializeMultiValue(a.values)).toBe(serializeMultiValue(b.values));
  });

  it("reports unknown region slugs instead of dropping them silently", () => {
    const out = normalizeRegionsParam("north,atlantis");
    expect(out.values).toEqual(["north"]);
    expect(out.rejected).toEqual(["atlantis"]);
  });

  it("serializes an empty selection as an absent parameter", () => {
    expect(serializeMultiValue([])).toBeUndefined();
  });
});

describe("language URL compatibility", () => {
  it("normalizes multiple languages in canonical declaration order", () => {
    expect(normalizeLanguagesParam("ru,he,ru").values).toEqual(["he", "ru"]);
  });

  it("reads legacy language= links into the canonical languages array", () => {
    expect(resolveSearchContract({ language: "ru" }).languages).toEqual(["ru"]);
  });

  it("does not let an empty new languages param mask a legacy language", () => {
    expect(resolveSearchContract({ languages: "", language: "ru" }).languages).toEqual(["ru"]);
  });

  it("gives a non-empty canonical languages param precedence over legacy language", () => {
    expect(resolveSearchContract({ languages: "he,en", language: "ru" }).languages).toEqual(["he", "en"]);
  });

  it("does not resurrect legacy language when a non-empty new value is invalid", () => {
    expect(resolveSearchContract({ languages: "zz", language: "ru" }).languages).toEqual([]);
  });
});

describe("city vs region separation", () => {
  it("keeps a real locality name in city and never turns it into a region", () => {
    expect(normalizeLegacyCityParam("חיפה")).toEqual({ city: "חיפה", regions: [] });
  });

  it("migrates legacy region slugs stored under city into regions", () => {
    expect(normalizeLegacyCityParam("north,south")).toEqual({
      city: "",
      regions: ["north", "south"],
    });
  });

  it("an explicit regions param wins over legacy city-encoded regions", () => {
    const c = resolveSearchContract({ city: "north", regions: "south" });
    expect(c.regions).toEqual(["south"]);
    expect(c.city).toBe("");
  });
});

describe("resolveSearchContract", () => {
  it("is idempotent: resolving its own output changes nothing", () => {
    const once = resolveSearchContract({
      q: "  חרדה  ",
      city: "חיפה",
      population: "children",
      languages: "ru",
      regions: "north,north",
      serviceTypes: ["online", "clinic"],
    });
    const twice = resolveSearchContract(once);
    expect(twice).toEqual(once);
  });

  it("an empty request produces a fully empty contract", () => {
    expect(resolveSearchContract({})).toEqual({
      q: "",
      problemSlugs: [],
      city: "",
      population: "",
      languages: [],
      regions: [],
      serviceTypes: [],
      professionSlugs: [],
      modalitySlugs: [],
      therapyFormats: [],
      gender: "",
      accessible: false,
      verified: false,
      lgbtqAffirming: false,
      freeIntro: false,
    });
  });

  it("normalizes canonical problem slugs from curated navigation", () => {
    const contract = resolveSearchContract({
      problem: "sleep_difficulties,anxiety,sleep_difficulties",
    });
    expect(contract.problemSlugs).toEqual(["anxiety", "sleep_difficulties"]);
  });
});
