/**
 * Provider-agnostic semantic classifier for Hebrew mental-health queries.
 *
 * Returns a future-proof JSON shape:
 *   { matches: [{ slug, confidence }, ...] }
 *
 * Phase 5/6: matching is token-aware and inflection-tolerant so paraphrased
 * or informal user input still resolves to the canonical problem slug. See
 * `flexibleHebrewMatch` in ./hebrew-normalizer.
 *
 * Tomorrow: a real provider (LLM) can replace `mockClassify` behind
 * `classifyQuery` without touching call sites.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { flexibleHebrewMatch } from "./hebrew-normalizer";
import { normalizeText as engineNormalize } from "./semantic-engine";

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

export function createMockClassifier(sb: SupabaseClient<Database>): SemanticClassifier {
  return {
    async classifyQuery(normalizedQuery: string): Promise<ClassificationResult> {
      // Phase 9: route normalization through the central engine.
      const q = engineNormalize(normalizedQuery);
      if (q.length < 2) return { matches: [], source: "mock" };

      // Pull the full vocabulary once. Cheaper than N ILIKE round-trips and
      // required for flexible (paraphrase / inflection) matching.
      const [problemsRes, aliasesRes, intentsRes] = await Promise.all([
        sb.from("problems").select("id, slug, name:name_he"),
        sb.from("problem_aliases").select("problem_id, alias"),
        sb.from("problem_intents").select("problem_slug, intent_text"),
      ]);
      const problems = (problemsRes.data ?? []) as Array<{
        id: string | number;
        slug: string;
        name: string | null;
      }>;
      const aliases = (aliasesRes.data ?? []) as Array<{
        problem_id: string | number;
        alias: string;
      }>;
      const intents = (intentsRes.data ?? []) as unknown as Array<{
        problem_slug: string | null;
        intent_text: string;
      }>;

      const slugById = new Map<string, string>();
      problems.forEach((p) => slugById.set(String(p.id), p.slug));
      const idBySlug = new Map<string, string>();
      problems.forEach((p) => idBySlug.set(p.slug, String(p.id)));

      const scoreByProblemId = new Map<string, number>();
      const bump = (id: string | number, w: number) => {
        const key = String(id);
        scoreByProblemId.set(key, (scoreByProblemId.get(key) ?? 0) + w);
      };

      // weights: direct problem-name > alias > intent
      problems.forEach((p) => {
        if (p.name && flexibleHebrewMatch(p.name, q)) bump(p.id, 3);
      });
      aliases.forEach((a) => {
        if (a.alias && flexibleHebrewMatch(a.alias, q)) bump(a.problem_id, 2);
      });
      intents.forEach((i) => {
        if (!i.intent_text || !i.problem_slug) return;
        const pid = idBySlug.get(i.problem_slug);
        if (pid && flexibleHebrewMatch(i.intent_text, q)) bump(pid, 1);
      });

      if (scoreByProblemId.size === 0) return { matches: [], source: "mock" };

      const ids = Array.from(scoreByProblemId.keys());
      const maxRaw = Math.max(...scoreByProblemId.values());
      const totalHits = Array.from(scoreByProblemId.values()).reduce((a, b) => a + b, 0);
      const saturation = Math.min(1, totalHits / 3);

      const matches: ClassificationMatch[] = ids
        .map((id) => {
          const raw = scoreByProblemId.get(id) ?? 0;
          const slug = slugById.get(id);
          if (!slug) return null;
          const rel = raw / maxRaw;
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

export async function classifyQuery(
  normalizedQuery: string,
  sb: SupabaseClient<Database>,
): Promise<ClassificationResult> {
  const mock = createMockClassifier(sb);
  return mock.classifyQuery(normalizedQuery);
}
