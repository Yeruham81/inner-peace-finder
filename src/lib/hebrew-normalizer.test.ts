import { describe, expect, it } from "bun:test";
import {
  collapseRepeatedChars,
  lightNormalizeHebrew,
  normalizeHebrew,
  normalizePunctuation,
  stripNikud,
} from "./hebrew-normalizer";

describe("lightNormalizeHebrew", () => {
  it("strips nikud and collapses whitespace", () => {
    expect(lightNormalizeHebrew("   חֲרָדָה   ")).toBe("חרד");
  });

  it("collapses repeated trailing punctuation and trims it off", () => {
    expect(lightNormalizeHebrew("חרדה!!!!")).toBe("חרד");
  });

  it("collapses runs of 3+ identical characters", () => {
    expect(lightNormalizeHebrew("חרדדדההה")).toBe("חרד");
  });

  it("collapses internal whitespace runs", () => {
    expect(lightNormalizeHebrew("   לחץ   וחרדה   ")).toBe("לחץ וחרד");
  });

  it("collapses repeated question marks", () => {
    expect(lightNormalizeHebrew("דיכאון???")).toBe("דיכאון");
  });

  it("handles combined char-repeat + punctuation noise on multi-token input", () => {
    expect(lightNormalizeHebrew("בגידדדהה בזוגיות!!!")).toBe("בגידה בזוג");
  });

  it("normalizeHebrew is a back-compat alias for lightNormalizeHebrew", () => {
    expect(normalizeHebrew("חרדה!!!!")).toBe(lightNormalizeHebrew("חרדה!!!!"));
  });

  it("is deterministic / idempotent on already-normalized input", () => {
    const once = lightNormalizeHebrew("בגידדדהה בזוגיות!!!");
    expect(lightNormalizeHebrew(once)).toBe(once);
  });

  it("preserves legitimate double letters (run of 2 stays)", () => {
    // "הה" length-2 run must NOT collapse; only 3+ collapses.
    expect(collapseRepeatedChars("שלום הההה")).toBe("שלום ה");
    expect(collapseRepeatedChars("שלום הה")).toBe("שלום הה");
  });

  it("stripNikud removes combining marks only", () => {
    expect(stripNikud("חֲרָדָה")).toBe("חרדה");
  });

  it("normalizePunctuation collapses runs and strips edges", () => {
    expect(normalizePunctuation("!!!hello???world...")).toBe("hello?world");
  });

  it("returns empty string for empty/whitespace-only input", () => {
    expect(lightNormalizeHebrew("")).toBe("");
    expect(lightNormalizeHebrew("     ")).toBe("");
  });
});