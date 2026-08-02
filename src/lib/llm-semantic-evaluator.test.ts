import { describe, expect, it } from "bun:test";
import {
  createLlmClassificationEvaluator,
  runLlmSemanticEvaluation,
} from "./llm-semantic-evaluator";
import { CLASSIFICATION_CASES, runSemanticCases } from "./semantic-evaluation";
import { withLocalAbstention, type LlmSemanticClassifier } from "./llm-semantic-adapter";
import {
  LlmProviderError,
  LlmTimeoutError,
  allowedSlugSet,
  attachServerProvenance,
  parseLlmSemanticResponse,
  type CanonicalProblemEntry,
} from "./llm-semantic-contract";

const CATALOG: CanonicalProblemEntry[] = [
  { slug: "anxiety", name: "חרדה", aliases: ["פחדים"] },
  { slug: "depression", name: "דיכאון", aliases: [] },
];
const ALLOWED = allowedSlugSet(CATALOG);

/** Deterministic scripted classifier: keyed on the remainder text. */
function scripted(script: Record<string, string | Error>): LlmSemanticClassifier {
  return withLocalAbstention({
    source: "scripted",
    async classify(input) {
      const step = script[input.semanticRemainder] ?? '{"matches":[],"abstained":true}';
      if (step instanceof Error) throw step;
      return attachServerProvenance(parseLlmSemanticResponse(step, ALLOWED), {
        modelVersion: "fake-model-v9",
        promptVersion: "q2-semantic-v1",
      });
    },
  });
}

describe("evaluator abstraction", () => {
  it("conforms to the existing Evaluator interface and runs through the existing runner", async () => {
    const evaluator = createLlmClassificationEvaluator(
      scripted({ "חרדה": '{"matches":[{"slug":"anxiety","confidence":0.9}],"abstained":false}' }),
      CATALOG,
    );
    expect(evaluator.kind).toBe("classify");
    const results = await runSemanticCases(
      [{ input: "חרדה", expected: ["anxiety"], category: "direct" }],
      evaluator,
    );
    expect(results[0]?.passed).toBe(true);
  });
});

describe("outcome categories", () => {
  it("distinguishes classification, abstention and every failure kind", async () => {
    const summary = await runLlmSemanticEvaluation(
      [
        { input: "a", expected: ["anxiety"], category: "direct" },
        { input: "b", expected: [], category: "ambiguous" },
        { input: "c", expected: ["anxiety"], category: "direct" },
        { input: "d", expected: ["anxiety"], category: "direct" },
        { input: "e", expected: ["anxiety"], category: "direct" },
        { input: "f", expected: ["anxiety"], category: "direct" },
      ],
      scripted({
        a: '{"matches":[{"slug":"anxiety","confidence":0.9}],"abstained":false}',
        b: '{"matches":[],"abstained":true}',
        c: new LlmTimeoutError(),
        d: new LlmProviderError(),
        e: '{"matches":[{"slug":"invented","confidence":0.5}],"abstained":false}',
        f: '{"matches":[',
      }),
      CATALOG,
      { now: () => 0 },
    );
    expect(summary.classified).toBe(1);
    expect(summary.validAbstentions).toBe(1);
    expect(summary.timeouts).toBe(1);
    expect(summary.providerErrors).toBe(2);
    expect(summary.unknownSlugFailures).toBe(1);
    expect(summary.invalidOutputs).toBe(1);
    expect(summary.errorsByCategory).toEqual({
      provider_timeout: 1,
      provider_error: 1,
      unknown_slug: 1,
      malformed_response: 1,
    });
    // Provider failures never become empty successful results.
    expect(summary.classifiedEmpty).toBe(0);
    expect(summary.records.filter((r) => r.outcome.startsWith("error:")).length).toBe(4);
  });

  it("computes Top-1 / Top-3 and per-slug recall correctly", async () => {
    const summary = await runLlmSemanticEvaluation(
      [
        { input: "a", expected: ["anxiety"], category: "direct" },
        { input: "b", expected: ["anxiety"], category: "direct" },
        { input: "c", expected: [], category: "ambiguous" },
      ],
      scripted({
        a: '{"matches":[{"slug":"anxiety","confidence":0.9}],"abstained":false}',
        b: '{"matches":[{"slug":"depression","confidence":0.9},{"slug":"anxiety","confidence":0.5}],"abstained":false}',
      }),
      CATALOG,
      { now: () => 0 },
    );
    expect(summary.scored).toBe(2);
    expect(summary.top1).toBe(1);
    expect(summary.top3).toBe(2);
    expect(summary.top1Accuracy).toBe(0.5);
    expect(summary.top3Accuracy).toBe(1);
    expect(summary.recallBySlug["anxiety"]).toEqual({ expected: 2, recalled: 2, recall: 1 });
  });

  it("records latency without waiting on real elapsed time", async () => {
    let t = 0;
    const summary = await runLlmSemanticEvaluation(
      [{ input: "a", expected: ["anxiety"], category: "direct" }],
      scripted({ a: '{"matches":[{"slug":"anxiety","confidence":0.9}],"abstained":false}' }),
      CATALOG,
      { now: () => (t += 5) },
    );
    expect(summary.records[0]?.latencyMs).toBe(5);
    expect(summary.latencyMsAverage).toBe(5);
  });
});

describe("full corpus, offline", () => {
  it("runs the entire existing corpus with a scripted provider and no external access", async () => {
    const summary = await runLlmSemanticEvaluation(
      CLASSIFICATION_CASES,
      // Every case abstains except a scripted few; failures must not abort.
      scripted({
        "חרדה": '{"matches":[{"slug":"anxiety","confidence":0.9}],"abstained":false}',
        "דיכאון": new LlmTimeoutError(),
      }),
      CATALOG,
      { now: () => 0 },
    );
    expect(summary.total).toBe(CLASSIFICATION_CASES.length);
    expect(summary.timeouts).toBe(1);
    expect(summary.validAbstentions).toBe(summary.total - 2);
    // NOTE: scripted/fake-provider metrics say nothing about real LLM quality
    // and are never compared to the deterministic SemanticEngine.
    expect(summary.top1Accuracy).toBeGreaterThanOrEqual(0);
  });
});