/**
 * Phase Q2.2 — OFFLINE evaluation support for the LLM semantic boundary.
 *
 * Uses the Phase 1 provider-independent `LlmSemanticClassifier` interface and
 * the existing `Evaluator` abstraction from `./semantic-evaluation`, so the
 * existing runner is reused unchanged.
 *
 * Offline only: scripted / fake / recorded provider-shaped responses. No live
 * model call, no credentials, no network. Fake-provider metrics say NOTHING
 * about real LLM quality and must never be compared with the deterministic
 * SemanticEngine as evidence of model superiority.
 */

import { LlmSemanticError, type LlmSemanticErrorCode } from "./llm-semantic-contract";
import type { CanonicalProblemEntry } from "./llm-semantic-contract";
import type { LlmSemanticClassifier } from "./llm-semantic-adapter";
import type { Evaluator, SemanticCase } from "./semantic-evaluation";

/** Every distinguishable outcome. Valid abstention is NEVER a failure. */
export type LlmOutcome =
  | "classified"
  | "classified_empty"
  | "abstained"
  | `error:${LlmSemanticErrorCode}`;

export type LlmEvaluationRecord = {
  input: string;
  expected: string[];
  slugs: string[];
  confidence?: number;
  outcome: LlmOutcome;
  errorCode?: LlmSemanticErrorCode;
  latencyMs: number;
  modelVersion?: string;
  promptVersion?: string;
  /** Provider usage metadata when reliably available (never estimated). */
  usage?: { promptTokens?: number; completionTokens?: number };
};

export type LlmEvaluationSummary = {
  total: number;
  /** Cases with at least one expected slug (Top-K denominator). */
  scored: number;
  top1: number;
  top3: number;
  top1Accuracy: number;
  top3Accuracy: number;
  /** Recall per expected canonical slug. */
  recallBySlug: Record<string, { expected: number; recalled: number; recall: number }>;
  validAbstentions: number;
  classified: number;
  classifiedEmpty: number;
  invalidOutputs: number;
  unknownSlugFailures: number;
  providerErrors: number;
  timeouts: number;
  errorsByCategory: Record<string, number>;
  latencyMsTotal: number;
  latencyMsAverage: number;
  records: LlmEvaluationRecord[];
};

const INVALID_OUTPUT_CODES: ReadonlySet<LlmSemanticErrorCode> = new Set([
  "empty_response",
  "malformed_response",
  "invalid_schema",
  "invalid_confidence",
  "conflicting_abstention",
  "too_many_matches",
  "provider_response_too_large",
]);

const PROVIDER_ERROR_CODES: ReadonlySet<LlmSemanticErrorCode> = new Set([
  "provider_error",
  "provider_timeout",
  "provider_rate_limited",
  "provider_server_error",
  "provider_client_error",
]);

/**
 * Adapt an LLM classifier to the existing `Evaluator` interface so the
 * existing `runSemanticCases` runner can drive it with no runner changes.
 * The catalog is supplied by the CALLER (dependency injection / offline use),
 * never by an external request.
 */
export function createLlmClassificationEvaluator(
  classifier: LlmSemanticClassifier,
  allowedProblems: readonly CanonicalProblemEntry[],
  id = `llm.${classifier.source}.classify`,
): Evaluator {
  return {
    id,
    kind: "classify",
    async evaluate(input) {
      const result = await classifier.classify({
        semanticRemainder: input,
        allowedProblems: [...allowedProblems],
      });
      return {
        slugs: result.matches.map((m) => m.slug),
        confidence: result.matches[0]?.confidence,
      };
    },
  };
}

/**
 * Run the offline corpus through an LLM classifier, keeping every outcome
 * category distinct. Policy: a provider failure is RECORDED per case and does
 * not abort the run (no fail-fast), and it is never converted into an empty
 * successful result or a generic fallback signal.
 */
export async function runLlmSemanticEvaluation(
  cases: readonly SemanticCase[],
  classifier: LlmSemanticClassifier,
  allowedProblems: readonly CanonicalProblemEntry[],
  options: { now?: () => number } = {},
): Promise<LlmEvaluationSummary> {
  const now = options.now ?? (() => Date.now());
  const records: LlmEvaluationRecord[] = [];

  for (const c of cases) {
    const startedAt = now();
    try {
      const result = await classifier.classify({
        semanticRemainder: c.input,
        allowedProblems: [...allowedProblems],
      });
      const slugs = result.matches.map((m) => m.slug);
      records.push({
        input: c.input,
        expected: [...c.expected],
        slugs,
        confidence: result.matches[0]?.confidence,
        outcome: result.abstained
          ? "abstained"
          : slugs.length === 0
            ? "classified_empty"
            : "classified",
        latencyMs: now() - startedAt,
        modelVersion: result.modelVersion,
        promptVersion: result.promptVersion,
      });
    } catch (err) {
      const code: LlmSemanticErrorCode =
        err instanceof LlmSemanticError ? err.code : "internal_error";
      records.push({
        input: c.input,
        expected: [...c.expected],
        slugs: [],
        outcome: `error:${code}`,
        errorCode: code,
        latencyMs: now() - startedAt,
      });
    }
  }

  return summarizeLlmEvaluation(records);
}

export function summarizeLlmEvaluation(records: LlmEvaluationRecord[]): LlmEvaluationSummary {
  const recallBySlug: LlmEvaluationSummary["recallBySlug"] = {};
  const errorsByCategory: Record<string, number> = {};
  let scored = 0;
  let top1 = 0;
  let top3 = 0;
  let validAbstentions = 0;
  let classified = 0;
  let classifiedEmpty = 0;
  let invalidOutputs = 0;
  let unknownSlugFailures = 0;
  let providerErrors = 0;
  let timeouts = 0;
  let latencyMsTotal = 0;

  for (const r of records) {
    latencyMsTotal += r.latencyMs;
    if (r.outcome === "abstained") validAbstentions += 1;
    if (r.outcome === "classified") classified += 1;
    if (r.outcome === "classified_empty") classifiedEmpty += 1;
    if (r.errorCode) {
      errorsByCategory[r.errorCode] = (errorsByCategory[r.errorCode] ?? 0) + 1;
      if (INVALID_OUTPUT_CODES.has(r.errorCode)) invalidOutputs += 1;
      if (r.errorCode === "unknown_slug") unknownSlugFailures += 1;
      if (PROVIDER_ERROR_CODES.has(r.errorCode)) providerErrors += 1;
      if (r.errorCode === "provider_timeout") timeouts += 1;
    }
    if (r.expected.length === 0) continue;
    scored += 1;
    const target = r.expected[0]!;
    if (r.slugs[0] === target) top1 += 1;
    if (r.slugs.slice(0, 3).includes(target)) top3 += 1;
    for (const slug of r.expected) {
      const bucket = (recallBySlug[slug] ??= { expected: 0, recalled: 0, recall: 0 });
      bucket.expected += 1;
      if (r.slugs.includes(slug)) bucket.recalled += 1;
      bucket.recall = bucket.recalled / bucket.expected;
    }
  }

  return {
    total: records.length,
    scored,
    top1,
    top3,
    top1Accuracy: scored === 0 ? 0 : top1 / scored,
    top3Accuracy: scored === 0 ? 0 : top3 / scored,
    recallBySlug,
    validAbstentions,
    classified,
    classifiedEmpty,
    invalidOutputs,
    unknownSlugFailures,
    providerErrors,
    timeouts,
    errorsByCategory,
    latencyMsTotal,
    latencyMsAverage: records.length === 0 ? 0 : latencyMsTotal / records.length,
    records,
  };
}
