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
/**
 * If the top two matches are within this confidence band of each other we
 * surface a *disambiguation* prompt (top candidates only) instead of the
 * generic low-confidence clarification. The numbers are not independent —
 * a strong-but-tied top pair should always disambiguate.
 */
export const DISAMBIGUATION_GAP = 0.12;

export type ClarificationOption = {
  slug: string;
  name: string;
  confidence: number;
};

export type ClarificationPrompt = {
  question: string;
  options: ClarificationOption[];
  /** "low_confidence" = top match weak; "disambiguation" = top matches tied. */
  reason: "low_confidence" | "disambiguation";
};

/** True when the top match is too weak to commit to a ranked result set. */
export function needsClarification(matches: ClassificationMatch[]): boolean {
  if (matches.length < 2) return false; // nothing meaningful to choose between
  const top = matches[0]?.confidence ?? 0;
  if (top < CONFIDENCE_THRESHOLD) return true;
  // Strong top match, but a near-tie with #2 → ask the user to pick.
  const gap = top - (matches[1]?.confidence ?? 0);
  return gap < DISAMBIGUATION_GAP;
}

/** Which flavour of clarification to render. */
export function clarificationReason(
  matches: ClassificationMatch[],
): "low_confidence" | "disambiguation" {
  const top = matches[0]?.confidence ?? 0;
  if (top < CONFIDENCE_THRESHOLD) return "low_confidence";
  return "disambiguation";
}

/**
 * Resolve up to 3 candidate problem slugs into display-ready options
 * (Hebrew name + slug + confidence) for the clarification UI.
 */
export async function buildClarificationPrompt(
  matches: ClassificationMatch[],
  sb: SupabaseClient<Database>,
): Promise<ClarificationPrompt> {
  const reason = clarificationReason(matches);
  // Disambiguation: only show the genuinely-tied head; low_confidence: show top 3.
  const top = reason === "disambiguation" ? matches.slice(0, 2) : matches.slice(0, 3);
  if (top.length === 0) {
    return { question: "", options: [], reason };
  }

  const { data } = await sb
    .from("problems")
    .select("slug, name:name_he")
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
    question:
      reason === "disambiguation"
        ? "מצאנו שתי התאמות חזקות. למה התכוונתם?"
        : "האם זה יותר קשור ל:",
    options,
    reason,
  };
}