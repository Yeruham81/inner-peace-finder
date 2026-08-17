/**
 * Test-only scripted "provider" for the LLM semantic boundary.
 *
 * It performs NO network calls and needs NO credentials. It returns raw
 * strings (or throws typed errors) exactly as a real provider would, so tests
 * can drive the REAL parser / validator / conversion code.
 */

import {
  LlmProviderError,
  LlmTimeoutError,
  parseLlmSemanticResponse,
  type LlmSemanticResult,
} from "../llm-semantic-contract";
import type { LlmSemanticClassifier, LlmSemanticInput } from "../llm-semantic-adapter";
import { withLocalAbstention } from "../llm-semantic-adapter";

export type FakeLlmScenario =
  | "valid"
  | "abstain"
  | "abstain_with_matches"
  | "malformed_json"
  | "unknown_slug"
  | "duplicate_slug"
  | "negative_confidence"
  | "confidence_above_one"
  | "string_confidence"
  | "nan_confidence"
  | "infinity_confidence"
  | "missing_confidence"
  | "missing_matches"
  | "missing_abstained"
  | "invalid_match_object"
  | "too_many_matches"
  | "empty_response"
  | "prose_before_json"
  | "prose_after_json"
  | "unsupported_top_level"
  | "timeout"
  | "network_error";

export const FAKE_MODEL_VERSION = "fake-model-v1";

/** Raw provider payloads per scenario. `slugs` supply catalog-valid slugs. */
export function fakeRawResponse(scenario: FakeLlmScenario, slugs: string[]): string {
  const a = slugs[0] ?? "anxiety";
  const b = slugs[1] ?? "depression";
  const c = slugs[2] ?? "trauma";
  const d = slugs[3] ?? "ocd_compulsions";
  switch (scenario) {
    case "valid":
      return JSON.stringify({
        matches: [
          { slug: a, confidence: 0.82 },
          { slug: b, confidence: 0.41 },
        ],
        abstained: false,
      });
    case "abstain":
      return JSON.stringify({ matches: [], abstained: true });
    case "abstain_with_matches":
      return JSON.stringify({ matches: [{ slug: a, confidence: 0.9 }], abstained: true });
    case "malformed_json":
      return '{"matches": [ {"slug": ';
    case "unknown_slug":
      return JSON.stringify({
        matches: [{ slug: "totally_invented_slug", confidence: 0.7 }],
        abstained: false,
      });
    case "duplicate_slug":
      return JSON.stringify({
        matches: [
          { slug: a, confidence: 0.5 },
          { slug: a, confidence: 0.8 },
        ],
        abstained: false,
      });
    case "negative_confidence":
      return JSON.stringify({ matches: [{ slug: a, confidence: -0.2 }], abstained: false });
    case "confidence_above_one":
      return JSON.stringify({ matches: [{ slug: a, confidence: 1.4 }], abstained: false });
    case "string_confidence":
      return JSON.stringify({ matches: [{ slug: a, confidence: "0.8" }], abstained: false });
    case "nan_confidence":
      return '{"matches":[{"slug":"' + a + '","confidence":NaN}],"abstained":false}';
    case "infinity_confidence":
      return '{"matches":[{"slug":"' + a + '","confidence":1e999}],"abstained":false}';
    case "missing_confidence":
      return JSON.stringify({ matches: [{ slug: a }], abstained: false });
    case "missing_matches":
      return JSON.stringify({ abstained: false });
    case "missing_abstained":
      return JSON.stringify({ matches: [{ slug: a, confidence: 0.5 }] });
    case "invalid_match_object":
      return JSON.stringify({ matches: ["anxiety"], abstained: false });
    case "too_many_matches":
      return JSON.stringify({
        matches: [
          { slug: a, confidence: 0.9 },
          { slug: b, confidence: 0.8 },
          { slug: c, confidence: 0.7 },
          { slug: d, confidence: 0.6 },
        ],
        abstained: false,
      });
    case "empty_response":
      return "";
    case "prose_before_json":
      return 'Sure! Here is the result:\n{"matches":[],"abstained":true}';
    case "prose_after_json":
      return '{"matches":[],"abstained":true}\nHope this helps!';
    case "unsupported_top_level":
      return JSON.stringify([{ slug: a, confidence: 0.5 }]);
    default:
      return "";
  }
}

export type FakeLlmProvider = LlmSemanticClassifier & {
  /** Number of times the underlying provider was actually invoked. */
  readonly callCount: number;
  readonly lastInput: LlmSemanticInput | null;
  scenario: FakeLlmScenario;
  reset(): void;
};

/**
 * Scripted provider. It parses its own raw output through the REAL strict
 * parser, so any scenario that a real provider could produce surfaces as the
 * same typed `LlmSemanticError`.
 */
export function createFakeLlmProvider(scenario: FakeLlmScenario = "valid"): FakeLlmProvider {
  let calls = 0;
  let lastInput: LlmSemanticInput | null = null;
  const provider = {
    source: "fake",
    scenario,
    get callCount() {
      return calls;
    },
    get lastInput() {
      return lastInput;
    },
    reset() {
      calls = 0;
      lastInput = null;
    },
    async classify(input: LlmSemanticInput): Promise<LlmSemanticResult> {
      calls += 1;
      lastInput = input;
      if (provider.scenario === "timeout") throw new LlmTimeoutError("fake timeout");
      if (provider.scenario === "network_error") throw new LlmProviderError("fake network failure");
      const slugs = input.allowedProblems.map((p) => p.slug);
      const raw = fakeRawResponse(provider.scenario, slugs);
      return parseLlmSemanticResponse(raw, new Set(slugs), {
        modelVersion: FAKE_MODEL_VERSION,
      });
    },
  } as FakeLlmProvider & { scenario: FakeLlmScenario };
  return provider;
}

/** Fake provider behind the local-abstention guard (the adapter boundary). */
export function createGuardedFakeLlmProvider(scenario: FakeLlmScenario = "valid"): {
  classifier: LlmSemanticClassifier;
  provider: FakeLlmProvider;
} {
  const provider = createFakeLlmProvider(scenario);
  return { classifier: withLocalAbstention(provider), provider };
}
