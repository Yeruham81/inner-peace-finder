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
  /** "mock" | "openai" | "anthropic" | "local" — reserved for observability. */
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