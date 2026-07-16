import { describe, expect, it } from "bun:test";
import { hasStrongExtractionEvidence } from "./semantic-engine";

type Ev = Parameters<typeof hasStrongExtractionEvidence>[0][number];
const ev = (o: Partial<Ev>): Ev => ({
  kind: "alias",
  base: 1,
  phrase: "",
  tokens: 1,
  quality: 1,
  full: false,
  ...o,
});

describe("hasStrongExtractionEvidence", () => {
  it("accepts a verbatim full-phrase match", () => {
    expect(hasStrongExtractionEvidence([ev({ phrase: "טראומה", full: true })])).toBe(true);
  });

  it("accepts strong multi-token evidence (quality ≥ 0.6)", () => {
    expect(hasStrongExtractionEvidence([ev({ phrase: "חרדה חברתית", tokens: 2, quality: 0.7 })])).toBe(true);
  });

  it("rejects weak multi-token overlap (quality < 0.6)", () => {
    // e.g. "הבנה עצמית" vs alias "דימוי עצמי נמוך" — one shared token.
    expect(hasStrongExtractionEvidence([ev({ phrase: "דימוי עצמי נמוך", tokens: 3, quality: 0.11 })])).toBe(false);
  });

  it("CASE 1: accepts an explicit single-token treatment term", () => {
    // Alias "אני בדיכאון" → after tokenization the only content token is "דיכאון".
    expect(hasStrongExtractionEvidence([ev({ phrase: "אני בדיכאון", tokens: 1, quality: 1 })])).toBe(true);
    // Direct single-token alias like "טראומה" or canonical name "אוטיזם".
    expect(hasStrongExtractionEvidence([ev({ phrase: "טראומה", tokens: 1, quality: 1 })])).toBe(true);
    expect(hasStrongExtractionEvidence([ev({ kind: "name", phrase: "אוטיזם", tokens: 1, quality: 1 })])).toBe(true);
  });

  it("CASE 1: rejects generic-anchor single tokens", () => {
    // "עצמי", "משבר", "יחסים", "קשר", "טיפול" must not create domains.
    for (const p of ["עצמי", "משבר", "יחסים", "קשר", "טיפול", "רגשי"]) {
      expect(hasStrongExtractionEvidence([ev({ phrase: p, tokens: 1, quality: 1 })])).toBe(false);
    }
  });

  it("CASE 1: rejects too-short tokens", () => {
    expect(hasStrongExtractionEvidence([ev({ phrase: "בי", tokens: 1, quality: 1 })])).toBe(false);
  });

  it("rejects intent-kind evidence outright", () => {
    expect(hasStrongExtractionEvidence([ev({ kind: "intent", phrase: "טראומה", full: true })])).toBe(false);
  });
});