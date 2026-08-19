import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolveSearchContract, serializeMultiValue } from "./search-contract";

describe("search language multi-select regression", () => {
  it("renders one canonical URL value for multiple languages", () => {
    const contract = resolveSearchContract({ languages: ["ru", "he", "ru"] });
    expect(contract.languages).toEqual(["he", "ru"]);
    expect(serializeMultiValue(contract.languages)).toBe("he,ru");
  });

  it("generated SearchForm navigation writes languages and removes legacy language", () => {
    const source = readFileSync(new URL("../components/search-form.tsx", import.meta.url), "utf8");
    expect(source).toContain("languages: serializeMultiValue(contract.languages)");
    expect(source).toContain("language: undefined");
  });

  it("the language filter is explicitly multi-select", () => {
    const source = readFileSync(new URL("../components/search-form.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/key: "language"[\s\S]*?multiple: true/);
    expect(source).toContain("setSelectedLanguages");
  });

  it("the route accepts both canonical languages and the legacy language param", () => {
    const source = readFileSync(new URL("../routes/search.tsx", import.meta.url), "utf8");
    expect(source).toContain("languages: fallback(");
    expect(source).toContain("language: fallback(");
    expect(source).toContain("languages: [...p.languages]");
  });
});
