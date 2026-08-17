/**
 * Thin wrapper around `SemanticEngine.classify()` (Phase 14).
 *
 * All classification logic lives in `./semantic-engine`. This module
 * only preserves the historical shape / call sites:
 *   `{ matches: [{ slug, confidence }], source }`
 *
 * No new callers should be added — import from `./semantic-engine` directly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SemanticEngine, type SemanticResult } from "./semantic-engine";

export type ClassificationMatch = SemanticResult;
export const MAX_MATCHES = 3;

export type ClassificationResult = {
  matches: ClassificationMatch[];
  /**
   * Observability tag only. Production semantic classification is always the
   * deterministic SemanticEngine; a future LLM provider is confined to the
   * separate `llm-semantic-adapter` boundary (semanticRemainder only) and does
   * not replace this classifier, the interpreter, or profile extraction.
   */
  source: string;
};

export interface SemanticClassifier {
  classifyQuery(normalizedQuery: string): Promise<ClassificationResult>;
}

export function createMockClassifier(sb: SupabaseClient<Database>): SemanticClassifier {
  return {
    async classifyQuery(normalizedQuery: string): Promise<ClassificationResult> {
      const matches = await SemanticEngine.classify(normalizedQuery, sb);
      return { matches, source: "mock" };
    },
  };
}

export async function classifyQuery(
  normalizedQuery: string,
  sb: SupabaseClient<Database>,
): Promise<ClassificationResult> {
  const matches = await SemanticEngine.classify(normalizedQuery, sb);
  return { matches, source: "mock" };
}
