/**
 * Provider-agnostic semantic classifier for Hebrew mental-health queries.
 *
 * Returns a future-proof JSON shape:
 *   { matches: [{ slug, confidence }, ...] }
 *
 * Today: MOCK implementation backed by existing problem_aliases /
 * problem_intents / problems.name lookups. The mock simulates LLM behavior
 * (ranked, scored matches) so the rest of the pipeline can be built and
 * tested before any external API is wired in.
 *
 * Tomorrow: a real provider (OpenAI / Anthropic / local model, called via
 * supabase/functions/classify-query) will replace `mockClassify` without
 * any change to call sites.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { lightNormalizeHebrew } from "./hebrew-normalizer";

export type ClassificationMatch = { slug: string; confidence: number };
export const MAX_MATCHES = 3;
export type ClassificationResult = {
  matches: ClassificationMatch[];
  /** "mock" | "openai" | "anthropic" | "local" — for observability later. */
  source: string;
};

export interface SemanticClassifier {
  classifyQuery(normalizedQuery: string): Promise<ClassificationResult>;
}

/* ------------------------------------------------------------------ */
/* Mock implementation                                                */
/* ------------------------------------------------------------------ */

/**
 * Mock classifier: counts alias / intent / problem-name hits per problem and
 * normalizes the score into a 0..1 confidence. Produces the same JSON shape
 * a real LLM provider will return, so downstream code is provider-agnostic.
 */
export function createMockClassifier(
  sb: SupabaseClient<Database>,
): SemanticClassifier {
  return {
    async classifyQuery(normalizedQuery: string): Promise<ClassificationResult> {
      // Guard: callers should already pass a normalized string, but normalize
      // again so cache keys and direct callers behave identically.
      const q = lightNormalizeHebrew(normalizedQuery);
      if (q.length < 2) return { matches: [], source: "mock" };

      const like = `%${q}%`;
      const [intents, aliases, problems] = await Promise.all([
        sb.from("problem_intents").select("problem_id").ilike("intent_text", like),
        sb.from("problem_aliases").select("problem_id").ilike("alias", like),
        sb.from("problems").select("id, slug").ilike("name", like),
      ]);

      // weight: direct problem-name match > alias > intent
      const scoreByProblemId = new Map<string, number>();
      const addHit = (id: string, w: number) =>
        scoreByProblemId.set(id, (scoreByProblemId.get(id) ?? 0) + w);

      problems.data?.forEach((r) => addHit(r.id, 3));
      aliases.data?.forEach((r) => addHit(r.problem_id, 2));
      intents.data?.forEach((r) => addHit(r.problem_id, 1));

      if (scoreByProblemId.size === 0) return { matches: [], source: "mock" };

      // resolve slugs
      const ids = Array.from(scoreByProblemId.keys());
      const { data: rows } = await sb
        .from("problems")
        .select("id, slug")
        .in("id", ids);
      const slugById = new Map(rows?.map((r) => [r.id, r.slug]) ?? []);

      const maxRaw = Math.max(...scoreByProblemId.values());
      // Confidence model: top hit gets up to 0.95, scaled by relative weight
      // and by saturation of evidence (>=3 total hits → full strength).
      const totalHits = Array.from(scoreByProblemId.values()).reduce((a, b) => a + b, 0);
      const saturation = Math.min(1, totalHits / 3);

      const matches: ClassificationMatch[] = ids
        .map((id) => {
          const raw = scoreByProblemId.get(id) ?? 0;
          const slug = slugById.get(id);
          if (!slug) return null;
          const rel = raw / maxRaw; // 0..1 vs top hit
          const confidence = Math.min(0.95, rel * saturation);
          return { slug, confidence: Number(confidence.toFixed(3)) };
        })
        .filter((m): m is ClassificationMatch => !!m)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_MATCHES);

      return { matches, source: "mock" };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Provider switch (future)                                           */
/* ------------------------------------------------------------------ */

/**
 * Public entry point. Today it always returns the mock; later it will dispatch
 * to OpenAI / Anthropic / local via `supabase/functions/classify-query`.
 */
export async function classifyQuery(
  normalizedQuery: string,
  sb: SupabaseClient<Database>,
): Promise<ClassificationResult> {
  // TODO(semantic-llm): when an API key is configured, POST to
  // /functions/v1/classify-query and use that result; fall back to mock on
  // failure. Keep the return shape identical so callers do not change.
  const mock = createMockClassifier(sb);
  return mock.classifyQuery(normalizedQuery);
}