/**
 * Semantic Evaluation Framework (Phase 17A).
 *
 * Reusable, deterministic evaluation harness for the semantic layer.
 * Two families of evaluators live here:
 *
 *   1. Primitive evaluators (Phase 10) — normalize / matchesText / scoreProfiles.
 *      These freeze the deterministic building blocks and are the regression
 *      safety net. Behavior preserved exactly.
 *
 *   2. Higher-level evaluators (Phase 17A) — query classification and
 *      therapist profile extraction. Both consume the shared `SemanticCase`
 *      shape from the corpus and are pluggable behind a common `Evaluator`
 *      interface so future sources (LLM shadow mode, embeddings, hybrid
 *      engine) can be added WITHOUT changing the runner.
 *
 * Determinism contract:
 *   - No LLM calls.
 *   - No timestamps / randomness.
 *   - No network beyond what the injected adapter chooses to do.
 *   - No dependency on production data ordering — callers inject the
 *     vocabulary / engine adapter used during the run.
 *
 * This module intentionally does not add new corpus cases. New cases live
 * in `./semantic-evaluation-corpus.ts`.
 */

import { SemanticEngine } from "./semantic-engine";
import {
  ALL_HIGHER_LEVEL_CORPUSES,
  CLASSIFICATION_CASES,
  MATCH_CASES,
  NORMALIZATION_CASES,
  PROFILE_CASES,
  PROFILE_EXTRACTION_CASES,
  type EvaluationCategory,
  type MatchCase,
  type NormalizationCase,
  type ProfileMatchCase,
  type SemanticCase,
} from "./semantic-evaluation-corpus";

// Re-export the corpus surface so downstream callers keep a single import.
export {
  CLASSIFICATION_CASES,
  MATCH_CASES,
  NORMALIZATION_CASES,
  PROFILE_CASES,
  PROFILE_EXTRACTION_CASES,
};
export type {
  EvaluationCategory,
  MatchCase,
  NormalizationCase,
  ProfileMatchCase,
  SemanticCase,
};

/* ------------------------------------------------------------------ */
/* Legacy typed case union (primitive evaluators) — Phase 10 shape.    */
/* Preserved verbatim for backward compatibility.                      */
/* ------------------------------------------------------------------ */

export type EvaluationCase =
  | ({ kind: "normalize" } & NormalizationCase)
  | ({ kind: "match" } & MatchCase)
  | ({ kind: "profile" } & ProfileMatchCase);

export type EvaluationResult = {
  name: string;
  kind: EvaluationCase["kind"] | "classify" | "extract-profile";
  category?: EvaluationCategory;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  detail?: string;
};

export const ALL_CASES: EvaluationCase[] = [
  ...NORMALIZATION_CASES.map((c) => ({
    kind: "normalize" as const,
    ...c,
    category: c.category ?? ("primitive_normalize" as EvaluationCategory),
  })),
  ...MATCH_CASES.map((c) => ({
    kind: "match" as const,
    ...c,
    category: c.category ?? ("primitive_match" as EvaluationCategory),
  })),
  ...PROFILE_CASES.map((c) => ({
    kind: "profile" as const,
    ...c,
    category: c.category ?? ("primitive_profile" as EvaluationCategory),
  })),
];

/* ------------------------------------------------------------------ */
/* Primitive evaluator (unchanged behavior)                            */
/* ------------------------------------------------------------------ */

const TOLERANCE = 1e-3;

export function runEvaluation(
  cases: EvaluationCase[] = ALL_CASES,
): EvaluationResult[] {
  return cases.map((c) => {
    const base = { name: c.name, kind: c.kind, category: c.category };
    try {
      if (c.kind === "normalize") {
        const actual = SemanticEngine.normalizeText(c.input);
        const passed = actual === c.expected;
        return {
          ...base,
          passed,
          expected: c.expected,
          actual,
          detail: passed ? undefined : `got "${actual}", expected "${c.expected}"`,
        };
      }
      if (c.kind === "match") {
        const actual = SemanticEngine.matchesText(c.phrase, c.haystack);
        const passed = actual === c.expected;
        return {
          ...base,
          passed,
          expected: c.expected,
          actual,
          detail: passed ? undefined : `got ${actual}, expected ${c.expected}`,
        };
      }
      const actual = SemanticEngine.matchProfiles(c.userProfile, c.therapistProfile);
      const passed = Math.abs(actual - c.expected) <= TOLERANCE;
      return {
        ...base,
        passed,
        expected: c.expected,
        actual,
        detail: passed ? undefined : `got ${actual}, expected ~${c.expected}`,
      };
    } catch (err) {
      return {
        ...base,
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

/* ------------------------------------------------------------------ */
/* Pluggable evaluator interface (Phase 17A)                           */
/* ------------------------------------------------------------------ */

/**
 * An `Evaluator` runs a single higher-level `SemanticCase` and returns the
 * slugs the system-under-test surfaced (already ordered by confidence, if
 * relevant). Purely deterministic: the caller injects any dependency
 * (engine, vocabulary, embedding index) at construction time.
 *
 * Future sources — LLM shadow mode, embeddings, hybrid engine — implement
 * this interface without any changes to the runner.
 */
export interface Evaluator {
  readonly id: string;
  readonly kind: "classify" | "extract-profile";
  evaluate(input: string): Promise<{ slugs: string[]; confidence?: number }>;
}

/** How strictly `expected` must match `actual` slugs. */
export type ExpectationMode =
  /** Every expected slug appears in actual (order-independent). */
  | "subset"
  /** Exact set equality (order-independent). */
  | "set"
  /** `expected` is a prefix of `actual`, in order. */
  | "ordered-prefix";

export type RunOptions = {
  expectationMode?: ExpectationMode;
  /** Minimum top-result confidence unless `allowLowConfidence` is set. */
  minConfidence?: number;
};

const DEFAULT_RUN_OPTIONS: Required<RunOptions> = {
  expectationMode: "subset",
  minConfidence: 0,
};

function compareSlugs(
  expected: string[],
  actual: string[],
  mode: ExpectationMode,
): boolean {
  const a = new Set(actual);
  switch (mode) {
    case "subset":
      return expected.every((s) => a.has(s));
    case "set":
      return expected.length === actual.length && expected.every((s) => a.has(s));
    case "ordered-prefix":
      if (expected.length > actual.length) return false;
      return expected.every((s, i) => s === actual[i]);
  }
}

export async function runSemanticCases(
  cases: readonly SemanticCase[],
  evaluator: Evaluator,
  options: RunOptions = {},
): Promise<EvaluationResult[]> {
  const opts = { ...DEFAULT_RUN_OPTIONS, ...options };
  const results: EvaluationResult[] = [];
  for (const c of cases) {
    const name = c.description ?? c.input;
    const base = {
      name,
      kind: evaluator.kind,
      category: c.category,
      expected: c.expected,
    };
    try {
      const { slugs, confidence } = await evaluator.evaluate(c.input);
      const slugsOk = compareSlugs(c.expected, slugs, opts.expectationMode);
      const confOk =
        c.allowLowConfidence ||
        confidence === undefined ||
        confidence >= opts.minConfidence;
      const passed = slugsOk && confOk;
      results.push({
        ...base,
        passed,
        actual: slugs,
        detail: passed
          ? undefined
          : !slugsOk
            ? `slugs mismatch (${opts.expectationMode}): got [${slugs.join(", ")}], expected [${c.expected.join(", ")}]`
            : `low confidence: ${confidence} < ${opts.minConfidence}`,
      });
    } catch (err) {
      results.push({
        ...base,
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Built-in evaluators over SemanticEngine                             */
/* ------------------------------------------------------------------ */

/**
 * Minimal Supabase-shaped surface required by the engine. Any deterministic
 * fake (in-memory vocabulary, fixture DB) satisfies this — no real network
 * calls are ever required by the framework itself.
 */
export type EngineDataSource = Parameters<typeof SemanticEngine.classify>[1];

export function createClassificationEvaluator(
  dataSource: EngineDataSource,
  id = "semantic-engine.classify",
): Evaluator {
  return {
    id,
    kind: "classify",
    async evaluate(input) {
      const results = await SemanticEngine.classify(input, dataSource);
      return {
        slugs: results.map((r) => r.slug),
        confidence: results[0]?.confidence,
      };
    },
  };
}

export function createProfileExtractionEvaluator(
  dataSource: EngineDataSource,
  id = "semantic-engine.extractProfile",
): Evaluator {
  return {
    id,
    kind: "extract-profile",
    async evaluate(input) {
      const profile = await SemanticEngine.extractProfile(input, dataSource);
      return {
        slugs: profile.map((e) => e.slug),
        confidence: profile[0]?.weight,
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

export type CategorySummary = {
  category: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
};

export type EvaluationSummary = {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  results: EvaluationResult[];
  byCategory: CategorySummary[];
  failedCases: EvaluationResult[];
};

/**
 * Top-K accuracy report (Phase 17C.1).
 *
 * Purely observational — does not alter ranking, scoring, or pass/fail
 * decisions. Reports how often the FIRST expected slug appears in the
 * first K predicted slugs (order-sensitive on `actual`, K-tolerant).
 *
 * Cases whose `expected` array is empty (deliberate "no-slug" cases such
 * as ambiguous inputs the engine should abstain on) are excluded from
 * the denominator so accuracy is not diluted.
 */
export type TopKAccuracy = {
  k: number;
  hits: number;
  total: number;
  accuracy: number;
};

export function computeTopKAccuracy(
  results: EvaluationResult[],
  k: number,
): TopKAccuracy {
  let hits = 0;
  let total = 0;
  for (const r of results) {
    const expected = Array.isArray(r.expected) ? (r.expected as string[]) : [];
    if (expected.length === 0) continue;
    total += 1;
    const actual = Array.isArray(r.actual) ? (r.actual as string[]) : [];
    if (actual.slice(0, k).includes(expected[0])) hits += 1;
  }
  return {
    k,
    hits,
    total,
    accuracy: total === 0 ? 1 : hits / total,
  };
}

/** Report Top-1 / Top-3 / Top-5 accuracy — permanent every-run metric. */
export function computeStandardTopK(results: EvaluationResult[]): TopKAccuracy[] {
  return [1, 3, 5].map((k) => computeTopKAccuracy(results, k));
}

export function summarizeEvaluation(results: EvaluationResult[]): EvaluationSummary {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  const byCat = new Map<string, { total: number; passed: number }>();
  for (const r of results) {
    const key = r.category ?? r.kind;
    const bucket = byCat.get(key) ?? { total: 0, passed: 0 };
    bucket.total += 1;
    if (r.passed) bucket.passed += 1;
    byCat.set(key, bucket);
  }
  const byCategory: CategorySummary[] = Array.from(byCat.entries())
    .map(([category, { total: t, passed: p }]) => ({
      category,
      total: t,
      passed: p,
      failed: t - p,
      passRate: t === 0 ? 1 : p / t,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return {
    total,
    passed,
    failed: total - passed,
    passRate: total === 0 ? 1 : passed / total,
    results,
    byCategory,
    failedCases: results.filter((r) => !r.passed),
  };
}

/** Human-readable multi-line report. Deterministic output for logs / CI. */
export function formatEvaluationReport(summary: EvaluationSummary): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(
    `Semantic evaluation: ${summary.passed}/${summary.total} passed (${pct(summary.passRate)})`,
  );

  if (summary.byCategory.length > 0) {
    lines.push("");
    lines.push("By category:");
    for (const c of summary.byCategory) {
      lines.push(
        `  - ${c.category}: ${c.passed}/${c.total} (${pct(c.passRate)})`,
      );
    }
  }

  if (summary.failedCases.length > 0) {
    lines.push("");
    lines.push(`Failed (${summary.failedCases.length}):`);
    for (const r of summary.failedCases) {
      const cat = r.category ? ` [${r.category}]` : "";
      const exp = r.expected !== undefined ? ` expected=${stringify(r.expected)}` : "";
      const act = r.actual !== undefined ? ` actual=${stringify(r.actual)}` : "";
      const why = r.detail ? ` — ${r.detail}` : "";
      lines.push(`  - (${r.kind})${cat} ${r.name}${exp}${act}${why}`);
    }
  }
  return lines.join("\n");
}

function stringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/* ------------------------------------------------------------------ */
/* Convenience: full higher-level corpus reference                     */
/* ------------------------------------------------------------------ */

export { ALL_HIGHER_LEVEL_CORPUSES };
