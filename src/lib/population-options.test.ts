import { describe, expect, it } from "bun:test";
import { buildPopulationOptions, canonicalPopulationSlug } from "./population-options";

describe("canonical population options", () => {
  it("renders homepage slugs with Hebrew labels even when legacy DB rows are returned", () => {
    const options = buildPopulationOptions([
      { slug: "teens", name: "נוער" },
      { slug: "elderly", name: "קשישים" },
    ]);
    expect(options.find((option) => option.value === "adolescents")?.label).toBe("בני נוער");
    expect(options.find((option) => option.value === "older-adults")?.label).toBe("הגיל השלישי");
    expect(options.some((option) => option.value === "teens")).toBe(false);
    expect(options.some((option) => option.value === "elderly")).toBe(false);
  });

  it("canonicalizes all legacy slugs", () => {
    expect(canonicalPopulationSlug("toddlers")).toBe("infants");
    expect(canonicalPopulationSlug("teens")).toBe("adolescents");
    expect(canonicalPopulationSlug("elderly")).toBe("older-adults");
  });
});
