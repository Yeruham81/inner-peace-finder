import { describe, expect, it } from "bun:test";
import {
  LLM_SEMANTIC_MAX_MATCHES,
  LlmSemanticError,
  allowedSlugSet,
  parseLlmSemanticResponse,
  toSemanticSignals,
  validateLlmSemanticResult,
  type CanonicalProblemEntry,
} from "./llm-semantic-contract";
import { fakeRawResponse } from "./test-support/fake-llm-provider";

const CATALOG: CanonicalProblemEntry[] = [
  { slug: "anxiety", name: "חרדה", aliases: ["פחדים"] },
  { slug: "depression", name: "דיכאון", aliases: ["מצב רוח ירוד"] },
  { slug: "trauma", name: "טראומה", aliases: [] },
  { slug: "ocd_compulsions", name: "אובססיות", aliases: [] },
];
const ALLOWED = allowedSlugSet(CATALOG);
const SLUGS = CATALOG.map((p) => p.slug);

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LlmSemanticError);
    return (e as LlmSemanticError).code;
  }
  throw new Error("expected a thrown LlmSemanticError");
}

describe("valid output", () => {
  it("accepts a valid response and preserves canonical confidences", () => {
    const r = parseLlmSemanticResponse(fakeRawResponse("valid", SLUGS), ALLOWED, {
      modelVersion: "m1",
      promptVersion: "p1",
    });
    expect(r.abstained).toBe(false);
    expect(r.matches).toEqual([
      { slug: "anxiety", confidence: 0.82 },
      { slug: "depression", confidence: 0.41 },
    ]);
    expect(r.modelVersion).toBe("m1");
    expect(r.promptVersion).toBe("p1");
  });

  it("converts to the existing SemanticSignal shape with llm source", () => {
    const r = parseLlmSemanticResponse(fakeRawResponse("valid", SLUGS), ALLOWED);
    const out = toSemanticSignals(r);
    expect(out.source).toBe("llm");
    expect(out.signals).toEqual([
      { slug: "anxiety", confidence: 0.82 },
      { slug: "depression", confidence: 0.41 },
    ]);
    for (const s of out.signals) {
      expect(Object.keys(s).sort()).toEqual(["confidence", "slug"]);
    }
  });

  it("orders deterministically by confidence desc then slug asc", () => {
    const r = validateLlmSemanticResult(
      {
        matches: [
          { slug: "trauma", confidence: 0.5 },
          { slug: "anxiety", confidence: 0.5 },
          { slug: "depression", confidence: 0.9 },
        ],
        abstained: false,
      },
      ALLOWED,
    );
    expect(r.matches.map((m) => m.slug)).toEqual(["depression", "anxiety", "trauma"]);
    expect(toSemanticSignals(r).signals.map((s) => s.slug)).toEqual([
      "depression",
      "anxiety",
      "trauma",
    ]);
  });

  it("is unaffected by catalog ordering", () => {
    const reversed = allowedSlugSet([...CATALOG].reverse());
    const a = parseLlmSemanticResponse(fakeRawResponse("valid", SLUGS), ALLOWED);
    const b = parseLlmSemanticResponse(fakeRawResponse("valid", SLUGS), reversed);
    expect(a).toEqual(b);
  });
});

describe("abstention", () => {
  it("accepts explicit abstention and yields no signals", () => {
    const r = parseLlmSemanticResponse(fakeRawResponse("abstain", SLUGS), ALLOWED);
    expect(r.abstained).toBe(true);
    expect(toSemanticSignals(r).signals).toEqual([]);
  });

  it("rejects abstention that carries matches", () => {
    expect(
      code(() => parseLlmSemanticResponse(fakeRawResponse("abstain_with_matches", SLUGS), ALLOWED)),
    ).toBe("conflicting_abstention");
  });

  it("rejects conflicting abstention at conversion time too", () => {
    expect(
      code(() =>
        toSemanticSignals({
          matches: [{ slug: "anxiety", confidence: 0.5 }],
          abstained: true,
          modelVersion: "m",
          promptVersion: "p",
        }),
      ),
    ).toBe("conflicting_abstention");
  });
});

describe("canonical slug validation", () => {
  it("rejects unknown slugs", () => {
    expect(code(() => parseLlmSemanticResponse(fakeRawResponse("unknown_slug", SLUGS), ALLOWED))).toBe(
      "unknown_slug",
    );
  });

  it("rejects a display name used as a slug", () => {
    expect(
      code(() =>
        validateLlmSemanticResult({ matches: [{ slug: "חרדה", confidence: 0.7 }], abstained: false }, ALLOWED),
      ),
    ).toBe("unknown_slug");
  });

  it("rejects an alias used as a slug", () => {
    expect(
      code(() =>
        validateLlmSemanticResult({ matches: [{ slug: "פחדים", confidence: 0.7 }], abstained: false }, ALLOWED),
      ),
    ).toBe("unknown_slug");
  });

  it("rejects a translated / invented label", () => {
    expect(
      code(() =>
        validateLlmSemanticResult({ matches: [{ slug: "Anxiety Disorder", confidence: 0.7 }], abstained: false }, ALLOWED),
      ),
    ).toBe("unknown_slug");
  });

  it("deduplicates duplicate slugs keeping the highest confidence", () => {
    const r = parseLlmSemanticResponse(fakeRawResponse("duplicate_slug", SLUGS), ALLOWED);
    expect(r.matches).toEqual([{ slug: "anxiety", confidence: 0.8 }]);
  });

  it("enforces the configured maximum", () => {
    expect(LLM_SEMANTIC_MAX_MATCHES).toBe(3);
    expect(
      code(() => parseLlmSemanticResponse(fakeRawResponse("too_many_matches", SLUGS), ALLOWED)),
    ).toBe("too_many_matches");
  });
});

describe("confidence validation", () => {
  const cases: Array<[string, string]> = [
    ["negative_confidence", "invalid_confidence"],
    ["confidence_above_one", "invalid_confidence"],
    ["string_confidence", "invalid_confidence"],
    ["infinity_confidence", "invalid_confidence"],
    ["missing_confidence", "invalid_confidence"],
  ];
  for (const [scenario, expected] of cases) {
    it(`rejects ${scenario}`, () => {
      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code(() => parseLlmSemanticResponse(fakeRawResponse(scenario as any, SLUGS), ALLOWED)),
      ).toBe(expected);
    });
  }

  it("rejects NaN (unparseable JSON literal) as malformed, never coerced", () => {
    expect(code(() => parseLlmSemanticResponse(fakeRawResponse("nan_confidence", SLUGS), ALLOWED))).toBe(
      "malformed_response",
    );
  });

  it("rejects NaN passed as a decoded value", () => {
    expect(
      code(() =>
        validateLlmSemanticResult({ matches: [{ slug: "anxiety", confidence: NaN }], abstained: false }, ALLOWED),
      ),
    ).toBe("invalid_confidence");
  });

  it("rejects Infinity passed as a decoded value", () => {
    expect(
      code(() =>
        validateLlmSemanticResult(
          { matches: [{ slug: "anxiety", confidence: Infinity }], abstained: false },
          ALLOWED,
        ),
      ),
    ).toBe("invalid_confidence");
  });
});

describe("structural validation", () => {
  const cases: Array<[string, string]> = [
    ["malformed_json", "malformed_response"],
    ["prose_before_json", "malformed_response"],
    ["prose_after_json", "malformed_response"],
    ["missing_matches", "invalid_schema"],
    ["missing_abstained", "invalid_schema"],
    ["invalid_match_object", "invalid_schema"],
    ["empty_response", "empty_response"],
    ["unsupported_top_level", "invalid_schema"],
  ];
  for (const [scenario, expected] of cases) {
    it(`rejects ${scenario}`, () => {
      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code(() => parseLlmSemanticResponse(fakeRawResponse(scenario as any, SLUGS), ALLOWED)),
      ).toBe(expected);
    });
  }

  it("rejects whitespace-only and nullish provider output", () => {
    expect(code(() => parseLlmSemanticResponse("   ", ALLOWED))).toBe("empty_response");
    expect(code(() => parseLlmSemanticResponse(null, ALLOWED))).toBe("empty_response");
  });

  it("rejects unknown top-level properties", () => {
    expect(
      code(() =>
        validateLlmSemanticResult({ matches: [], abstained: true, extra: 1 }, ALLOWED),
      ),
    ).toBe("invalid_schema");
  });

  it("rejects scalars and null top-level values", () => {
    expect(code(() => validateLlmSemanticResult(null, ALLOWED))).toBe("invalid_schema");
    expect(code(() => validateLlmSemanticResult("ok", ALLOWED))).toBe("invalid_schema");
  });
});