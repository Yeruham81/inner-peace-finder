/**
 * Phase Q1 — THE single normalization contract shared by:
 *   - user query input (`interpretQuery`),
 *   - production catalog names/aliases (`buildSearchCatalog`).
 *
 * It mirrors `lightNormalizeHebrew` but intentionally SKIPS
 * `foldInflections`, so gender-bearing suffixes stay distinguishable:
 *   - "אישה" stays "אישה" (does not collapse to "איש"),
 *   - "פסיכולוגית" stays "פסיכולוגית",
 *   - "מטפלת" stays "מטפלת".
 *
 * Both sides of every lookup MUST go through this function. Do not add a
 * second normalization pipeline for catalogs.
 */

import {
  collapseRepeatedChars,
  foldSofit,
  normalizePunctuation,
  normalizeWhitespace,
  stripNikud,
} from "./semantic-engine";

export function normalizeForInterpretation(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFKC");
  s = stripNikud(s);
  s = normalizeWhitespace(s);
  s = normalizePunctuation(s);
  // Internal hyphens act as a token separator in Hebrew search queries
  // (e.g. "ב-CBT" → "ב cbt"). Applied to both user input and catalog
  // variants so both sides stay comparable.
  s = s.replace(/-/g, " ");
  s = s.toLowerCase();
  s = foldSofit(s);
  s = collapseRepeatedChars(s);
  return normalizeWhitespace(s);
}

export function normalizeList(items: readonly string[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    const n = normalizeForInterpretation(it);
    if (n) out.push(n);
  }
  return out;
}
