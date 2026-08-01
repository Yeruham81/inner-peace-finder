/**
 * Phase Q2 — LLM semantic contract (LOCAL ONLY, no provider, no network).
 *
 * Scope boundary (authoritative):
 *   - Deterministic interpretation (`query-interpreter`) stays authoritative
 *     for professions, modalities, populations, languages, cities, delivery
 *     modes, gender, therapist names, hard/soft routing and eligibility.
 *   - A future LLM may ONLY classify `semanticRemainder` into canonical
 *     problem slugs. It never ranks, never filters, never extracts
 *     therapist profiles, and never controls search.
 *   - Production Unified Search continues to use the deterministic
 *     `SemanticEngine` as its ONLY semantic classifier.
 *
 * This module contains: the provider-independent result contract, a strict
 * parser/validator for future provider output, canonical-slug validation and
 * one conversion into the existing `SemanticSignal` type.
 */

import { z } from "zod";
import { SEMANTIC_MAX_MATCHES, type CanonicalProblemEntry } from "./semantic-engine";
import type { SemanticSignal } from "./query-interpreter.types";

export type { CanonicalProblemEntry };

/** Accepted matches may never exceed the deterministic engine's maximum. */
export const LLM_SEMANTIC_MAX_MATCHES = SEMANTIC_MAX_MATCHES;

export type LlmSemanticMatch = {
  /** Canonical problem slug — never a display name, alias or translation. */
  slug: string;
  /** Finite number in [0, 1]. */
  confidence: number;
};

export type LlmSemanticResult = {
  matches: LlmSemanticMatch[];
  abstained: boolean;
  modelVersion: string;
  promptVersion: string;
};

/** Stable, typed failure codes so later server integration can branch. */
export type LlmSemanticErrorCode =
  | "empty_response"
  | "malformed_response"
  | "invalid_schema"
  | "unknown_slug"
  | "invalid_confidence"
  | "conflicting_abstention"
  | "too_many_matches"
  | "provider_error"
  | "provider_timeout";

export class LlmSemanticError extends Error {
  readonly code: LlmSemanticErrorCode;
  constructor(code: LlmSemanticErrorCode, message?: string) {
    super(message ?? code);
    this.name = "LlmSemanticError";
    this.code = code;
  }
}

/** Transport-level provider failure (never a classification). */
export class LlmProviderError extends LlmSemanticError {
  constructor(message = "provider error") {
    super("provider_error", message);
    this.name = "LlmProviderError";
  }
}

/** Provider timeout — stays a typed timeout, never an empty classification. */
export class LlmTimeoutError extends LlmSemanticError {
  constructor(message = "provider timeout") {
    super("provider_timeout", message);
    this.name = "LlmTimeoutError";
  }
}

/* ------------------------------------------------------------------ */
/* Canonical allowed-slug set                                          */
/* ------------------------------------------------------------------ */

/**
 * Derive the allowed-slug set from canonical problem entries loaded through
 * the SAME catalog read as the deterministic engine
 * (`SemanticEngine.loadCanonicalProblems`). Catalog read errors propagate
 * from that loader; they are never converted into an empty catalog here.
 *
 * Ordering of the input entries cannot affect validation: membership only.
 */
export function allowedSlugSet(problems: readonly CanonicalProblemEntry[]): Set<string> {
  const set = new Set<string>();
  for (const p of problems) {
    if (typeof p?.slug === "string" && p.slug.length > 0) set.add(p.slug);
  }
  return set;
}

/* ------------------------------------------------------------------ */
/* Strict shape validation                                             */
/* ------------------------------------------------------------------ */

const matchSchema = z
  .object({
    slug: z.string().min(1),
    confidence: z.unknown(),
  })
  .strict();

const responseSchema = z
  .object({
    matches: z.array(matchSchema),
    abstained: z.boolean(),
    modelVersion: z.string().min(1).optional(),
    promptVersion: z.string().min(1).optional(),
  })
  .strict();

export type ValidateOptions = {
  /** Recorded on the validated result (provider/prompt provenance). */
  modelVersion?: string;
  promptVersion?: string;
};

function assertConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LlmSemanticError("invalid_confidence", "confidence must be a finite number");
  }
  if (value < 0 || value > 1) {
    throw new LlmSemanticError("invalid_confidence", "confidence must be within [0, 1]");
  }
  return value;
}

/**
 * Validate an already-JSON-decoded provider payload against the contract and
 * the canonical slug set. Throws `LlmSemanticError` with a stable code.
 * Never coerces malformed values.
 */
export function validateLlmSemanticResult(
  payload: unknown,
  allowed: ReadonlySet<string>,
  opts: ValidateOptions = {},
): LlmSemanticResult {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new LlmSemanticError("invalid_schema", "top-level value must be a JSON object");
  }
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new LlmSemanticError("invalid_schema", parsed.error.issues[0]?.message ?? "invalid schema");
  }
  const data = parsed.data;

  // Validate every match before any abstention / cap decision so the most
  // specific error code always wins.
  const validated: LlmSemanticMatch[] = data.matches.map((m) => ({
    slug: m.slug,
    confidence: assertConfidence(m.confidence),
  }));
  for (const m of validated) {
    if (!allowed.has(m.slug)) {
      throw new LlmSemanticError("unknown_slug", `slug not in canonical catalog: ${m.slug}`);
    }
  }

  if (data.abstained && validated.length > 0) {
    throw new LlmSemanticError(
      "conflicting_abstention",
      "abstained:true cannot coexist with matches",
    );
  }

  // Deterministic dedup: highest confidence wins, first occurrence breaks ties.
  const byslug = new Map<string, LlmSemanticMatch>();
  for (const m of validated) {
    const prev = byslug.get(m.slug);
    if (!prev || m.confidence > prev.confidence) byslug.set(m.slug, m);
  }
  const deduped = sortMatches([...byslug.values()]);

  if (deduped.length > LLM_SEMANTIC_MAX_MATCHES) {
    throw new LlmSemanticError(
      "too_many_matches",
      `at most ${LLM_SEMANTIC_MAX_MATCHES} matches are accepted`,
    );
  }

  return {
    matches: deduped,
    abstained: data.abstained,
    modelVersion: data.modelVersion ?? opts.modelVersion ?? "unknown",
    promptVersion: data.promptVersion ?? opts.promptVersion ?? "unknown",
  };
}

/** Deterministic order: confidence desc, then slug asc. */
function sortMatches(matches: LlmSemanticMatch[]): LlmSemanticMatch[] {
  return [...matches].sort(
    (a, b) => b.confidence - a.confidence || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
}

/* ------------------------------------------------------------------ */
/* Strict raw-text parser                                              */
/* ------------------------------------------------------------------ */

/**
 * Parse raw provider text. ONLY a bare JSON object is accepted: prose before
 * or after the JSON, code fences, arrays and scalars are all rejected.
 * Unexpected output never becomes a successful classification.
 */
export function parseLlmSemanticResponse(
  raw: string | null | undefined,
  allowed: ReadonlySet<string>,
  opts: ValidateOptions = {},
): LlmSemanticResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new LlmSemanticError("empty_response", "provider returned no content");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.trim());
  } catch {
    throw new LlmSemanticError("malformed_response", "response is not valid JSON");
  }
  return validateLlmSemanticResult(decoded, allowed, opts);
}

/* ------------------------------------------------------------------ */
/* Conversion to the existing canonical semantic type                  */
/* ------------------------------------------------------------------ */

/**
 * LLM-derived semantic signals. `signals` is the EXISTING `SemanticSignal[]`
 * type consumed by Unified Search — no new downstream representation is
 * introduced. The wrapper only carries provenance for observability.
 */
export type LlmDerivedSemanticSignals = {
  signals: SemanticSignal[];
  source: "llm";
  modelVersion: string;
  promptVersion: string;
};

/**
 * Convert an ALREADY-VALIDATED result into semantic signals.
 *
 * Conversion rule: confidence is preserved verbatim (the contract range
 * [0, 1] is identical to `SemanticEngine.classify()` confidences), order is
 * deterministic (confidence desc, slug asc), slugs are unique and the count
 * is capped at `LLM_SEMANTIC_MAX_MATCHES`. Abstention → empty list.
 *
 * NOT wired to `TherapistSearchPlan` or live Unified Search.
 */
export function toSemanticSignals(result: LlmSemanticResult): LlmDerivedSemanticSignals {
  if (result.abstained && result.matches.length > 0) {
    throw new LlmSemanticError("conflicting_abstention", "abstained result carries matches");
  }
  const byslug = new Map<string, number>();
  for (const m of result.matches) {
    const conf = assertConfidence(m.confidence);
    const prev = byslug.get(m.slug);
    if (prev === undefined || conf > prev) byslug.set(m.slug, conf);
  }
  const signals = sortMatches([...byslug].map(([slug, confidence]) => ({ slug, confidence })))
    .slice(0, LLM_SEMANTIC_MAX_MATCHES)
    .map((m) => ({ slug: m.slug, confidence: m.confidence }));
  return {
    signals: result.abstained ? [] : signals,
    source: "llm",
    modelVersion: result.modelVersion,
    promptVersion: result.promptVersion,
  };
}