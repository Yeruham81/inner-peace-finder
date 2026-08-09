/**
 * The canonical explicit-search contract: one filter selection must always
 * produce exactly one URL shape, and unknown values must be rejected rather
 * than silently reinterpreted.
 */

import { describe, expect, it } from "bun:test";
import {
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
      language: "ru",
      regions: "north,north",
      serviceTypes: ["online", "clinic"],
    });
    const twice = resolveSearchContract(once);
    expect(twice).toEqual(once);
  });

  it("an empty request produces a fully empty contract", () => {
    expect(resolveSearchContract({})).toEqual({
      q: "",
      city: "",
      population: "",
      language: "",
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
});
