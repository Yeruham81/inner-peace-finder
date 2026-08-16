/**
 * Server-only semantic orchestration for production Unified Search.
 *
 * Order of authority:
 *   1. exact canonical problem names / curated aliases (deterministic, locked),
 *   2. LLM interpretation of free wording/context, validated against the
 *      server-loaded canonical catalog,
 *   3. TEMPORARY deterministic SemanticEngine fallback if the LLM path fails.
 *
 * `problem_intents` are reachable only through step 3 because the new normal
 * catalog read is problems + problem_aliases only. Once the LLM route is
 * evaluated in production and accepted, that fallback bridge can be removed
 * together with problem_intents from SemanticEngine and the database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  exactEvidenceToSignals,
  findExactCanonicalEvidence,
  hasWholeRemainderExactEvidence,
  mergeAuthoritativeSemanticSignals,
} from "./canonical-semantic-evidence";
import { classifySemanticRemainder, type LlmLogger } from "./llm-classify-service";
import { createOpenAiTransport, type LlmTransport } from "./llm-gateway-transport";
import {
  loadProviderConfigFromEnv,
  type LlmProviderConfig,
  type ServerEnv,
} from "./llm-provider-config";
import { toSemanticSignals } from "./llm-semantic-contract";
import { SemanticEngine, type CanonicalProblemEntry } from "./semantic-engine";
import type { SemanticSignal } from "./query-interpreter.types";

export type UnifiedSemanticSource = "deterministic_exact" | "llm" | "deterministic_fallback";

export type UnifiedSemanticClassification = {
  signals: SemanticSignal[];
  source: UnifiedSemanticSource;
  fallbackUsed: boolean;
};

export type UnifiedSemanticClassifierDeps = {
  loadCatalog?: () => Promise<CanonicalProblemEntry[]>;
  config?: LlmProviderConfig;
  env?: ServerEnv;
  transport?: LlmTransport;
  logger?: LlmLogger;
  fallbackClassify?: (input: string) => Promise<SemanticSignal[]>;
};

function processEnv(): ServerEnv {
  return { get: (name) => process.env[name] };
}

function canonicalOnly(
  signals: readonly SemanticSignal[],
  catalog: readonly CanonicalProblemEntry[],
): SemanticSignal[] {
  const allowed = new Set(catalog.map((problem) => problem.slug));
  return signals.filter(
    (signal) =>
      allowed.has(signal.slug) &&
      Number.isFinite(signal.confidence) &&
      signal.confidence >= 0 &&
      signal.confidence <= 1,
  );
}

/**
 * Classify one deterministic interpreter remainder. Catalog read errors are
 * NOT swallowed: without the canonical allow-list there is no safe semantic
 * route. Provider/config/payload failures do fall back to SemanticEngine.
 */
export async function classifyUnifiedSemanticRemainder(
  semanticRemainder: string,
  sb: SupabaseClient<Database>,
  deps: UnifiedSemanticClassifierDeps = {},
): Promise<UnifiedSemanticClassification> {
  const loadCatalog = deps.loadCatalog ?? (() => SemanticEngine.loadCanonicalProblems(sb));
  const catalog = await loadCatalog();
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error("Canonical treatment-domain catalog is missing or empty");
  }

  const exactEvidence = findExactCanonicalEvidence(semanticRemainder, catalog);
  const exactSignals = exactEvidenceToSignals(exactEvidence);

  // A complete exact curated phrase needs no probabilistic interpretation.
  if (hasWholeRemainderExactEvidence(semanticRemainder, exactEvidence)) {
    return { signals: exactSignals, source: "deterministic_exact", fallbackUsed: false };
  }

  try {
    const config = deps.config ?? loadProviderConfigFromEnv(deps.env ?? processEnv());
    const transport = deps.transport ?? createOpenAiTransport();
    const llmResult = await classifySemanticRemainder(
      { semanticRemainder },
      {
        loadCatalog: async () => catalog,
        config,
        transport,
        logger: deps.logger,
      },
    );
    const llmSignals = canonicalOnly(toSemanticSignals(llmResult).signals, catalog);
    return {
      signals: mergeAuthoritativeSemanticSignals(exactSignals, llmSignals),
      source: "llm",
      fallbackUsed: false,
    };
  } catch {
    // TEMPORARY migration bridge. This is intentionally the only normal-search
    // route that may still depend on problem_intents via SemanticEngine.classify.
    const fallback = deps.fallbackClassify
      ? await deps.fallbackClassify(semanticRemainder)
      : await SemanticEngine.classify(semanticRemainder, sb);
    return {
      signals: mergeAuthoritativeSemanticSignals(exactSignals, canonicalOnly(fallback, catalog)),
      source: "deterministic_fallback",
      fallbackUsed: true,
    };
  }
}
