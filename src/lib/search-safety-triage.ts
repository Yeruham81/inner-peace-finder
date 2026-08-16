/**
 * Deterministic pre-classification safety triage for Unified Search.
 *
 * This gate runs BEFORE canonical-domain classification and before any LLM
 * request. It is intentionally narrow: only high-specificity wording that can
 * indicate immediate self-harm/suicide risk or an acute medical emergency
 * blocks therapist search. Ambiguous distress wording is marked `watch` so it
 * can still be interpreted in context after the safety pass.
 *
 * This is not a diagnosis and does not attempt to infer clinical severity.
 */

import { normalizeText } from "./semantic-engine";

export type SearchSafetyStatus = "clear" | "watch" | "urgent";
export type SearchSafetyReason =
  | "self_harm_or_suicide"
  | "immediate_medical_danger"
  | "ambiguous_distress"
  | null;

export type SearchSafetyTriage = {
  status: SearchSafetyStatus;
  reason: SearchSafetyReason;
};

const URGENT_SELF_HARM_PHRASES = [
  "מחשבות אובדניות",
  "מחשבה אובדנית",
  "נטיות אובדניות",
  "נטייה אובדנית",
  "אובדני",
  "אובדנית",
  "אובדניים",
  "אובדניות",
  "התאבדות",
  "להתאבד",
  "רוצה להתאבד",
  "אני רוצה להתאבד",
  "מתכוון להתאבד",
  "מתכוונת להתאבד",
  "מתכנן להתאבד",
  "מתכננת להתאבד",
  "אני אתאבד",
  "אני רוצה למות",
  "רוצה למות",
  "לא רוצה לחיות",
  "אני לא רוצה לחיות",
  "פגיעה עצמית",
  "לפגוע בעצמי",
  "להרוג את עצמי",
  "חותך את עצמי",
  "חותכת את עצמי",
] as const;

const URGENT_MEDICAL_PHRASES = [
  "לא מצליח לנשום",
  "לא מצליחה לנשום",
  "לא יכול לנשום",
  "לא יכולה לנשום",
  "כאב בחזה",
  "כאבים בחזה",
  "לחץ בחזה",
  "מנת יתר",
  "לקחתי מנת יתר",
  "בלעתי יותר מדי כדורים",
  "לקחתי יותר מדי כדורים",
  "דימום כבד",
  "חשד לשבץ",
  "חשד להתקף לב",
] as const;

/**
 * Phrases deliberately removed from deterministic aliases because they may be
 * ordinary figurative distress OR a safety/medical cue. They must encounter
 * this gate first, but do not by themselves justify blocking search.
 */
const AMBIGUOUS_DISTRESS_PHRASES = [
  "אין לי אוויר כבר",
  "אני עומד להתפרק",
  "אני עומדת להתפרק",
  "לא יכול יותר",
  "לא יכולה יותר",
] as const;

function normalizedIncludes(haystack: string, phrase: string): boolean {
  const needle = normalizeText(phrase);
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function containsAny(normalizedQuery: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => normalizedIncludes(normalizedQuery, phrase));
}

export function triageSearchSafety(query: string | null | undefined): SearchSafetyTriage {
  const normalized = normalizeText(query ?? "");
  if (!normalized) return { status: "clear", reason: null };

  if (containsAny(normalized, URGENT_SELF_HARM_PHRASES)) {
    return { status: "urgent", reason: "self_harm_or_suicide" };
  }

  if (containsAny(normalized, URGENT_MEDICAL_PHRASES)) {
    return { status: "urgent", reason: "immediate_medical_danger" };
  }

  if (containsAny(normalized, AMBIGUOUS_DISTRESS_PHRASES)) {
    return { status: "watch", reason: "ambiguous_distress" };
  }

  return { status: "clear", reason: null };
}
