import { describe, expect, it } from "bun:test";
import {
  LlmProviderError,
  LlmTimeoutError,
  LlmSemanticError,
  allowedSlugSet,
  toSemanticSignals,
  type CanonicalProblemEntry,
} from "./llm-semantic-contract";
import { NoopLlmSemanticClassifier, isBlankRemainder } from "./llm-semantic-adapter";
import {
  createFakeLlmProvider,
  createGuardedFakeLlmProvider,
  FAKE_MODEL_VERSION,
} from "./test-support/fake-llm-provider";

const CATALOG: CanonicalProblemEntry[] = [
  { slug: "anxiety", name: "חרדה", aliases: ["פחדים"] },
  { slug: "depression", name: "דיכאון", aliases: [] },
  { slug: "trauma", name: "טראומה", aliases: [] },
  { slug: "ocd_compulsions", name: "אובססיות", aliases: [] },
];

const input = (remainder: string) => ({
  semanticRemainder: remainder,
  allowedProblems: CATALOG,
});

describe("adapter input surface", () => {
  it("carries only the remainder and the canonical catalog", () => {
    const keys = Object.keys(input("לחץ בעבודה")).sort();
    expect(keys).toEqual(["allowedProblems", "semanticRemainder"]);
  });

  it("passes no therapist records, user identifiers or filter state to the provider", async () => {
    const provider = createFakeLlmProvider("valid");
    await provider.classify(input("חרדה חברתית"));
    const seen = provider.lastInput!;
    expect(Object.keys(seen).sort()).toEqual(["allowedProblems", "semanticRemainder"]);
    for (const p of seen.allowedProblems) {
      expect(Object.keys(p).sort()).toEqual(["aliases", "name", "slug"]);
    }
    const serialized = JSON.stringify(seen);
    for (const forbidden of ["therapist", "user_id", "userId", "city", "gender", "language", "token"]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });
});

describe("local abstention", () => {
  it("treats empty / whitespace remainders as blank", () => {
    expect(isBlankRemainder("")).toBe(true);
    expect(isBlankRemainder("   \n\t")).toBe(true);
    expect(isBlankRemainder("חרדה")).toBe(false);
  });

  it("does not invoke the provider for an empty remainder", async () => {
    const { classifier, provider } = createGuardedFakeLlmProvider("valid");
    const r = await classifier.classify(input(""));
    expect(provider.callCount).toBe(0);
    expect(r.abstained).toBe(true);
    expect(toSemanticSignals(r).signals).toEqual([]);
  });

  it("does not invoke the provider for a whitespace-only remainder", async () => {
    const { classifier, provider } = createGuardedFakeLlmProvider("valid");
    await classifier.classify(input("   \n  "));
    expect(provider.callCount).toBe(0);
  });

  it("invokes the provider exactly once for a non-empty remainder", async () => {
    const { classifier, provider } = createGuardedFakeLlmProvider("valid");
    const r = await classifier.classify(input("התקפי חרדה"));
    expect(provider.callCount).toBe(1);
    expect(r.modelVersion).toBe(FAKE_MODEL_VERSION);
    expect(toSemanticSignals(r).signals.length).toBe(2);
  });
});

describe("failure behavior", () => {
  it("keeps timeouts as typed timeout errors", async () => {
    const { classifier, provider } = createGuardedFakeLlmProvider("timeout");
    await expect(classifier.classify(input("חרדה"))).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(provider.callCount).toBe(1);
  });

  it("keeps network failures as typed provider errors", async () => {
    const { classifier } = createGuardedFakeLlmProvider("network_error");
    await expect(classifier.classify(input("חרדה"))).rejects.toBeInstanceOf(LlmProviderError);
  });

  it("never turns malformed output into a semantic signal or an empty-state reason", async () => {
    for (const scenario of [
      "malformed_json",
      "prose_before_json",
      "prose_after_json",
      "unknown_slug",
      "empty_response",
      "missing_abstained",
      "negative_confidence",
      "too_many_matches",
    ] as const) {
      const { classifier } = createGuardedFakeLlmProvider(scenario);
      let thrown: unknown;
      try {
        await classifier.classify(input("משהו לא ברור"));
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(LlmSemanticError);
      const code = (thrown as LlmSemanticError).code;
      expect(["unrecognized_query", "no_matching_therapists"]).not.toContain(code);
    }
  });

  it("noop classifier throws instead of inventing a fallback signal", async () => {
    await expect(
      NoopLlmSemanticClassifier.classify(input("חרדה")),
    ).rejects.toBeInstanceOf(LlmSemanticError);
  });

  it("catalog ordering does not change validation or ordering guarantees", async () => {
    const allowed = allowedSlugSet(CATALOG);
    expect(allowed.size).toBe(4);
    for (const catalog of [CATALOG, [...CATALOG].reverse()]) {
      const provider = createFakeLlmProvider("valid");
      const r = await provider.classify({ semanticRemainder: "חרדה", allowedProblems: catalog });
      // Every accepted slug is canonical, confidences are ordered desc and
      // the cap holds — regardless of the order rows were supplied in.
      expect(r.matches.every((m) => allowed.has(m.slug))).toBe(true);
      expect(r.matches.map((m) => m.confidence)).toEqual(
        [...r.matches.map((m) => m.confidence)].sort((x, y) => y - x),
      );
      expect(r.matches.length).toBeLessThanOrEqual(3);
    }
  });
});