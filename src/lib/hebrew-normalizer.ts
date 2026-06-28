/**
 * Hebrew text normalization for semantic intake.
 *
 * Runs BEFORE alias matching, intent matching, and semantic classification.
 * Goal: collapse trivial surface variations (nikud, punctuation, common
 * feminine/plural inflections) so the cache key and the classifier see a
 * stable, canonical form.
 *
 * Intentionally conservative — rule-based, no morphological analyzer.
 * Future LLM provider can normalize further on its side.
 */

// Nikud + cantillation marks: U+0591..U+05C7
const NIKUD_RE = /[\u0591-\u05C7]/g;
// Anything that isn't a letter, number, or whitespace → space
const PUNCT_RE = /[^\p{L}\p{N}\s]+/gu;
const WS_RE = /\s+/g;

/** Strip vowel points and cantillation. */
export function stripNikud(input: string): string {
  return input.replace(NIKUD_RE, "");
}

/** Replace punctuation with spaces and collapse whitespace. */
export function stripPunctuation(input: string): string {
  return input.replace(PUNCT_RE, " ").replace(WS_RE, " ").trim();
}

/**
 * Naive feminine → masculine + plural → singular folding.
 * Hebrew has no real "case" so we lowercase Latin chars only.
 * Rules apply per whitespace-separated token and only when the result
 * keeps the token at least 2 chars long.
 */
export function foldInflections(input: string): string {
  return input
    .split(" ")
    .map((tok) => {
      if (tok.length < 3) return tok;
      let t = tok;
      // plurals
      if (t.endsWith("ים") && t.length > 3) t = t.slice(0, -2); // masc plural
      else if (t.endsWith("ות") && t.length > 3) t = t.slice(0, -2); // fem plural
      else if (t.endsWith("יות") && t.length > 4) t = t.slice(0, -3);
      // feminine singular → masculine
      if (t.endsWith("ית") && t.length > 3) t = t.slice(0, -2) + "י";
      else if (t.endsWith("ה") && t.length > 3) t = t.slice(0, -1);
      return t;
    })
    .join(" ");
}

/**
 * Full pipeline: nikud → punctuation → lowercase → inflection folding.
 * Deterministic; safe to use as a cache key.
 */
export function normalizeHebrew(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFKC");
  s = stripNikud(s);
  s = stripPunctuation(s);
  s = s.toLowerCase();
  s = foldInflections(s);
  return s.replace(WS_RE, " ").trim();
}