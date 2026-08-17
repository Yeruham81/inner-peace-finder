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
const WS_RE = /\s+/g;
// Class of "punctuation noise" we deduplicate / strip at edges.
// Intentionally narrow: keeps internal letters/digits/whitespace untouched.
const PUNCT_CLASS = "!?.,;:\\-\\u05BE\\u200E\\u200F\"'`~^*_(){}\\[\\]<>/\\\\|+=";
const REPEATED_PUNCT_RE = new RegExp(`([${PUNCT_CLASS}])\\1{1,}`, "g");
const LEADING_PUNCT_RE = new RegExp(`^[${PUNCT_CLASS}\\s]+`);
const TRAILING_PUNCT_RE = new RegExp(`[${PUNCT_CLASS}\\s]+$`);
// Any run of 3+ identical chars → 1 (handles Hebrew letters + Latin alike).
const REPEATED_CHAR_RE = /(.)\1{2,}/gu;

/**
 * Hebrew "final letter" (sofit) → base letter mapping. Sofit variants only
 * appear at the end of a word in correct spelling, so any interior sofit
 * is a typo / elongation artifact. We fold sofit → base UNIVERSALLY in the
 * normalized form so aliases ("לחץ") and elongated user input ("בלחצץץ" →
 * "בלחצצצ") converge to the same skeleton after repeat-collapse.
 */
const SOFIT_MAP: Record<string, string> = {
  ם: "מ",
  ן: "נ",
  ץ: "צ",
  ף: "פ",
  ך: "כ",
};
const SOFIT_RE = /[םןץףך]/g;

/** Latin-only tokens (ADHD, OCD, PTSD, CBT, EMDR, digits) bypass all
 * Hebrew-specific folding (sofit / prefix strip / plural-feminine drop). */
const LATIN_TOKEN_RE = /^[A-Za-z0-9]+$/;

/** Fold sofit letters to their base form everywhere in the string. */
export function foldSofit(input: string): string {
  return input.replace(SOFIT_RE, (c) => SOFIT_MAP[c] ?? c);
}

/** True when the token is purely ASCII letters/digits (Latin acronym). */
export function isLatinToken(token: string): boolean {
  return LATIN_TOKEN_RE.test(token);
}

/** Strip vowel points and cantillation. */
export function stripNikud(input: string): string {
  return input.replace(NIKUD_RE, "");
}

/** Collapse runs of whitespace into single spaces and trim. */
export function normalizeWhitespace(input: string): string {
  return input.replace(WS_RE, " ").trim();
}

/**
 * Collapse repeated punctuation runs to a single char (`!!! → !`, `??? → ?`,
 * `... → .`) and strip punctuation/whitespace at the start and end of the
 * string. Internal single-character punctuation is preserved.
 */
export function normalizePunctuation(input: string): string {
  return input
    .replace(REPEATED_PUNCT_RE, "$1")
    .replace(LEADING_PUNCT_RE, "")
    .replace(TRAILING_PUNCT_RE, "");
}

/**
 * Collapse runs of 3+ identical consecutive characters down to a single
 * occurrence. Legitimate double letters (run of exactly 2) are preserved.
 *
 *   חרדדדההה → חרדה
 *   לחוץץץץ  → לחוץ
 *   בגידדדהה → בגידה
 */
export function collapseRepeatedChars(input: string): string {
  return input.replace(REPEATED_CHAR_RE, "$1");
}

/**
 * Naive feminine → masculine + plural → singular folding.
 * Hebrew has no real "case" so we lowercase Latin chars only.
 * Rules apply per whitespace-separated token and only when the result
 * keeps the token at least 2 chars long.
 *
 * Latin tokens (ADHD, OCD, ...) are returned unchanged.
 */
export function foldInflections(input: string): string {
  return input
    .split(" ")
    .map((tok) => {
      if (isLatinToken(tok)) return tok;
      if (tok.length < 3) return tok;
      let t = tok;
      // plurals
      if (t.endsWith("ים") && t.length > 3)
        t = t.slice(0, -2); // masc plural
      else if (t.endsWith("ות") && t.length > 3)
        t = t.slice(0, -2); // fem plural
      else if (t.endsWith("יות") && t.length > 4) t = t.slice(0, -3);
      // feminine singular → masculine
      if (t.endsWith("ית") && t.length > 3) t = t.slice(0, -2) + "י";
      else if (t.endsWith("ה") && t.length > 3) t = t.slice(0, -1);
      return t;
    })
    .join(" ");
}

/**
 * Lightweight normalization pipeline. Order matters and is part of the
 * contract — changing it would invalidate cached classifications.
 *
 *   1. NFKC
 *   2. strip nikud
 *   3. normalize whitespace (trim + collapse)
 *   4. normalize punctuation (collapse repeats, strip edges)
 *   5. lowercase Latin letters
 *   6. fold sofit → base (BEFORE repeat-collapse, so mixed elongations
 *      like "לחצץץ" → "לחצצצ" collapse cleanly).
 *   7. collapse 3+ char repetitions
 *   8. tail-repeat collapse per Hebrew token (folds "לחצצ"→"לחצ")
 *   9. naive feminine/plural folding
 *
 * Deterministic, no I/O — safe to use as a cache key.
 */
export function lightNormalizeHebrew(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFKC");
  s = stripNikud(s);
  s = normalizeWhitespace(s);
  s = normalizePunctuation(s);
  s = s.toLowerCase();
  s = foldSofit(s);
  s = collapseRepeatedChars(s);
  s = collapseTailRepeat(s);
  s = foldInflections(s);
  return normalizeWhitespace(s);
}

/**
 * Per-token: collapse a trailing pair of identical letters (Hebrew only).
 * `REPEATED_CHAR_RE` only fires on 3+ runs; this catches the residual "צצ"
 * that appears after sofit-folding an elongated final letter (e.g. the
 * original "בלחצץ" → sofit "בלחצצ" → tail "בלחצ").
 */
function collapseTailRepeat(input: string): string {
  return input
    .split(" ")
    .map((tok) => {
      // Only fire on visibly elongated tokens. Length 4 is far too short —
      // real words like "בודד" (lonely) end in a legitimate double letter.
      // With sofit already folded, elongation of a single final letter
      // ("בלחצץ" → "בלחצצ") lands at length ≥5.
      if (isLatinToken(tok) || tok.length < 5) return tok;
      const last = tok[tok.length - 1];
      const prev = tok[tok.length - 2];
      if (last === prev) return tok.slice(0, -1);
      return tok;
    })
    .join(" ");
}

/**
 * Backwards-compatible alias. All call sites should keep working; the
 * upgrade is transparent.
 * Deterministic; safe to use as a cache key.
 */
export function normalizeHebrew(input: string): string {
  return lightNormalizeHebrew(input);
}

/* ------------------------------------------------------------------ */
/* Token-level utilities (Phase 5–7 recall improvements)              */
/* ------------------------------------------------------------------ */

/**
 * Common Hebrew one-letter prefixes that attach to nouns/verbs and hurt
 * naive substring matching (e.g. "בחרדה" vs alias "חרדה", "ולחץ" vs "לחץ").
 * We only strip when the remaining token is still meaningful (≥3 chars),
 * to avoid mangling short real words.
 */
const HEBREW_PREFIXES = ["ה", "ו", "ב", "כ", "ל", "מ", "ש"] as const;

export function stripHebrewPrefix(token: string): string {
  if (isLatinToken(token)) return token;
  if (token.length < 4) return token;
  const first = token[0];
  if ((HEBREW_PREFIXES as readonly string[]).includes(first)) {
    const rest = token.slice(1);
    if (rest.length >= 3) return rest;
  }
  return token;
}

/**
 * Split normalized input into a set of "canonical" tokens for flexible
 * matching. Runs `lightNormalizeHebrew` (nikud, punctuation, plural/feminine
 * folding) and additionally strips a single Hebrew prefix letter per token.
 *
 * Very short tokens (<2 chars) and generic stopwords are dropped so
 * high-frequency filler doesn't cause false positives.
 */
const HEBREW_STOPWORDS = new Set([
  "אני",
  "אתה",
  "את",
  "הוא",
  "היא",
  "אנחנו",
  "הם",
  "הן",
  "של",
  "עם",
  "על",
  "אל",
  "לא",
  "כן",
  "זה",
  "זו",
  "יש",
  "אין",
  "מה",
  "מי",
  "איך",
  "למה",
  "כי",
  "אם",
  "או",
  "גם",
  "רק",
  "כל",
  // NOTE: "אבל" intentionally omitted — it is a content word for grief_loss
  // (mourning) as well as a conjunction, and blocking it drops legitimate
  // alias hits.
  "היה",
  "היתה",
  "להיות",
  "מאוד",
  "יותר",
  "פחות",
  "לפני",
  "אחרי",
  "שלי",
  "שלך",
  "שלו",
  "שלה",
]);

/** Sofit-folded stopwords — matched against the normalized form. */
const HEBREW_STOPWORDS_NORM = new Set(Array.from(HEBREW_STOPWORDS).map((w) => foldSofit(w)));

export function tokenizeHebrew(input: string): string[] {
  const normalized = lightNormalizeHebrew(input);
  if (!normalized) return [];
  const out: string[] = [];
  for (const raw of normalized.split(" ")) {
    if (!raw || raw.length < 2) continue;
    if (isLatinToken(raw)) {
      out.push(raw);
      continue;
    }
    const stripped = stripHebrewPrefix(raw);
    if (stripped.length < 2) continue;
    if (
      HEBREW_STOPWORDS.has(stripped) ||
      HEBREW_STOPWORDS.has(raw) ||
      HEBREW_STOPWORDS_NORM.has(stripped) ||
      HEBREW_STOPWORDS_NORM.has(raw)
    )
      continue;
    out.push(stripped);
  }
  return out;
}

export function tokenSetHebrew(input: string): Set<string> {
  return new Set(tokenizeHebrew(input));
}

/**
 * Yod / vav insertion tolerance. Israeli spelling swings freely between
 * ktiv male ("דיכאון", "לחוץ") and ktiv haser ("דכאון", "לחץ"). Stripping
 * every yod and vav produces a stable skeleton for equality comparison.
 *
 * Only used as a secondary matching attempt — the primary substring /
 * token overlap paths run first, so this cannot degrade precision on
 * exact matches.
 */
function yodVavFold(s: string): string {
  return s.replace(/[יו]/g, "");
}

/**
 * Flexible containment for Hebrew: true when the phrase's tokens overlap
 * the haystack's tokens (any overlap wins) OR when the fully normalized
 * phrase appears as a substring of the normalized haystack.
 *
 * Additionally applies a yod/vav-tolerant per-token equality pass to
 * accept Israeli spelling variants ("דכאון"↔"דיכאון", "לחץ"↔"לחוץ",
 * "אמא"↔"אימא", "עצב"↔"עצוב").
 *
 * Used by the classifier and by therapist bio extraction so paraphrased /
 * inflected inputs still hit the canonical vocabulary.
 */
export function flexibleHebrewMatch(phrase: string, haystack: string): boolean {
  const nPhrase = lightNormalizeHebrew(phrase);
  const nHay = lightNormalizeHebrew(haystack);
  if (!nPhrase || !nHay) return false;
  // Stopword safety: a phrase whose ENTIRE normalized form is a stopword
  // must never produce a match by itself — it carries no semantic weight.
  if (HEBREW_STOPWORDS.has(nPhrase) || HEBREW_STOPWORDS_NORM.has(nPhrase)) return false;
  if (nPhrase.length >= 2 && nHay.includes(nPhrase)) return true;
  const pTokens = tokenizeHebrew(phrase);
  if (pTokens.length === 0) return false;
  const hTokens = tokenSetHebrew(haystack);
  if (hTokens.size === 0) return false;
  for (const t of pTokens) {
    if (hTokens.has(t)) return true;
    // Substring overlap between individual tokens catches shared roots
    // like "מבחן" / "מבחנים" (already folded), "לחוץ" / "לחץ".
    if (t.length >= 4) {
      for (const h of hTokens) {
        if (h.length >= 4 && (h.includes(t) || t.includes(h))) return true;
      }
    }
  }
  // Secondary pass: yod/vav-tolerant per-token equality. Requires the
  // folded phrase-token to be at least 3 chars long, so 2-letter roots
  // (which are far too common) cannot false-positive on any haystack.
  for (const t of pTokens) {
    if (isLatinToken(t)) continue;
    const tf = yodVavFold(t);
    if (tf.length < 3) continue;
    for (const h of hTokens) {
      if (isLatinToken(h)) continue;
      const hf = yodVavFold(h);
      if (hf.length < 3) continue;
      if (tf === hf) return true;
      // Length-diff-1 substring: catches "בדד" ⊂ "בדדת" style folding
      // only when both sides are ≥4 chars folded — conservative.
      if (tf.length >= 4 && hf.length >= 4 && (hf.includes(tf) || tf.includes(hf))) return true;
    }
  }
  return false;
}
