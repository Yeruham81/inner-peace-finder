/**
 * Clarification layer for low-confidence semantic searches.
 *
 * When the classifier's top match falls below the confidence threshold,
 * we do NOT run the therapist ranker. Instead we surface the top candidate
 * problems back to the user as a multiple-choice clarification:
 *   "האם זה יותר קשור ל:"
 *     • חרדה
 *     • עומס נפשי
 *     • קושי זוגי
 *
 * The user's choice becomes an explicit `problemSlug` filter on the next
 * search request, which bypasses classification entirely.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ClassificationMatch } from "./semantic-classifier";

export const CONFIDENCE_THRESHOLD = 0.65;

export type ClarificationOption = {
  slug: string;
  name: string;
  confidence: number;
};

export type ClarificationPrompt = {
  question: string;
  options: ClarificationOption[];
};

/** True when the top match is too weak to commit to a ranked result set. */
export function needsClarification(matches: ClassificationMatch[]): boolean {
  if (matches.length < 2) return false; // nothing meaningful to choose between
  const top = matches[0]?.confidence ?? 0;
  return top < CONFIDENCE_THRESHOLD;
}

/**
 * Resolve up to 3 candidate problem slugs into display-ready options
 * (Hebrew name + slug + confidence) for the clarification UI.
 */
export async function buildClarificationPrompt(
  matches: ClassificationMatch[],
  sb: SupabaseClient<Database>,
): Promise<ClarificationPrompt> {
  const top = matches.slice(0, 3);
  if (top.length === 0) return { question: "", options: [] };

  const { data } = await sb
    .from("problems")
    .select("slug, name")
    .in("slug", top.map((m) => m.slug));
  const nameBySlug = new Map(data?.map((r) => [r.slug, r.name]) ?? []);

  const options: ClarificationOption[] = top
    .map((m) => {
      const name = nameBySlug.get(m.slug);
      if (!name) return null;
      return { slug: m.slug, name, confidence: m.confidence };
    })
    .filter((o): o is ClarificationOption => !!o);

  return {
    question: "האם זה יותר קשור ל:",
    options,
  };
}