/**
 * Phase P3.2b — editor-local treatment-domain feedback for the therapist
 * profile editor field `full_description` ("קצת עליי").
 *
 * ISOLATED FROM PRODUCTION SEARCH. Nothing here is imported by the unified
 * search flow, query interpretation, ranking, eligibility or
 * `semantic_profile` generation. `SemanticEngine.extractProfile` and
 * `src/lib/hebrew-normalizer.ts` are reused read-only and never modified.
 *
 * Matching is STRICT: only full normalized phrase evidence (with ordinary
 * Hebrew clitic prefixes, approved joined forms and Latin-abbreviation
 * skeletons) may surface a canonical domain. No fuzzy matching, no edit
 * distance, no token-set overlap, no single generic token.
 */

import {
  collapseRepeatedChars,
  foldSofit,
  isLatinToken,
  stripHebrewPrefix,
  stripNikud,
} from "./hebrew-normalizer";

/* ------------------------------------------------------------------ */
/* Normalization (editor-local)                                       */
/* ------------------------------------------------------------------ */

const HYPHENS_RE = /[\u05BE\u2010\u2011\u2012\u2013\u2014\u2015\u2212_-]/g;
const NON_WORD_RE = /[^\p{L}\p{N} ]+/gu;

/**
 * Normalize a phrase or a whole description for editor feedback matching.
 * Handles nikud, whitespace, punctuation adjacent to tokens (commas,
 * periods, parentheses), hyphen/maqaf variants, Latin case, and periods or
 * spaces inside Latin abbreviations (via `tokenizeFeedback`).
 */
export function normalizeFeedbackText(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFKC");
  s = stripNikud(s);
  s = s.replace(HYPHENS_RE, " ");
  s = s.toLowerCase();
  s = s.replace(NON_WORD_RE, " ");
  // Hebrew↔Latin boundaries act as token separators ("בOCD" → "ב ocd").
  s = s.replace(/([\u0590-\u05FF])([A-Za-z0-9])/g, "$1 $2");
  s = s.replace(/([A-Za-z0-9])([\u0590-\u05FF])/g, "$1 $2");
  s = foldSofit(s);
  s = collapseRepeatedChars(s);
  return s.replace(/\s+/g, " ").trim();
}

export type FeedbackToken = { text: string; index: number };

/**
 * Tokenize normalized text, merging runs of single Latin letters into one
 * token so `O.C.D`, `O C D` and `OCD` share the skeleton `ocd`.
 */
export function tokenizeFeedback(input: string): FeedbackToken[] {
  const normalized = normalizeFeedbackText(input);
  const raw: FeedbackToken[] = [];
  const re = /[^\s]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) raw.push({ text: m[0], index: m.index });

  const out: FeedbackToken[] = [];
  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i]!;
    if (tok.text.length === 1 && isLatinToken(tok.text)) {
      let joined = tok.text;
      let j = i + 1;
      while (j < raw.length && raw[j]!.text.length === 1 && isLatinToken(raw[j]!.text)) {
        joined += raw[j]!.text;
        j++;
      }
      if (joined.length > 1) {
        out.push({ text: joined, index: tok.index });
        i = j - 1;
        continue;
      }
    }
    out.push(tok);
  }
  return out;
}

/** Normalized alphabetic skeleton of a Latin abbreviation (`O.C.D` → `ocd`). */
export function latinSkeleton(input: string): string {
  return tokenizeFeedback(input)
    .filter((t) => isLatinToken(t.text))
    .map((t) => t.text)
    .join("");
}

/* ------------------------------------------------------------------ */
/* Safety rules                                                       */
/* ------------------------------------------------------------------ */

/**
 * Single-token phrases that must NEVER create a domain on their own — either
 * generic clinical anchors or Hebrew words with a common non-clinical
 * reading (notably "אבל", which is also the conjunction "but"). Existing
 * database aliases are left untouched; they are simply ignored here.
 */
const UNSAFE_SINGLE_TOKENS = new Set(
  [
    "אבל", "אובדן", "שכול", "עצמי", "עצמית", "משבר", "משברים", "שינוי", "שינויים",
    "הורים", "הורות", "כפייתיות", "כפייתי", "לחץ", "סטרס", "פחד", "פחדים", "דאגנות",
    "סמים", "טיפול", "טיפולי", "יחסים", "קשר", "רגשי", "רגשית", "סיוטים", "פלאשבקים",
    "משפחה", "זהות", "דימוי", "התמודדות", "אדם", "נפש", "נפשית",
  ].map((w) => normalizeFeedbackText(w)),
);

const MIN_HEBREW_SINGLE_TOKEN = 3;
const MIN_LATIN_SINGLE_TOKEN = 2;
const MIN_JOINED_PART = 3;

type PreparedPhrase = {
  original: string;
  tokens: string[];
  /** Joined (space-less) form, when every part is long enough to be safe. */
  joined: string | null;
};

/** Prepare a canonical name or alias for matching; `null` when unusable. */
export function preparePhrase(phrase: string): PreparedPhrase | null {
  if (!phrase) return null;
  const tokens = tokenizeFeedback(phrase).map((t) => t.text);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) {
    const t = tokens[0]!;
    if (UNSAFE_SINGLE_TOKENS.has(t)) return null;
    const min = isLatinToken(t) ? MIN_LATIN_SINGLE_TOKEN : MIN_HEBREW_SINGLE_TOKEN;
    if (t.length < min) return null;
  }
  const joined =
    tokens.length > 1 && tokens.every((t) => t.length >= MIN_JOINED_PART)
      ? tokens.join("")
      : null;
  return { original: phrase, tokens, joined };
}

function sameToken(descToken: string, phraseToken: string): boolean {
  if (descToken === phraseToken) return true;
  // Ordinary Hebrew clitic prefixes: "בדיכאון" ↔ "דיכאון", "בטראומה" ↔ "טראומה".
  const d = stripHebrewPrefix(descToken);
  const p = stripHebrewPrefix(phraseToken);
  return d === phraseToken || descToken === p || d === p;
}

/**
 * First character index (in the normalized description) at which `prepared`
 * appears as a complete phrase, or -1.
 */
export function findPhraseIndex(prepared: PreparedPhrase, descTokens: FeedbackToken[]): number {
  const { tokens, joined } = prepared;
  for (let i = 0; i + tokens.length <= descTokens.length; i++) {
    let ok = true;
    for (let j = 0; j < tokens.length; j++) {
      if (!sameToken(descTokens[i + j]!.text, tokens[j]!)) {
        ok = false;
        break;
      }
    }
    if (ok) return descTokens[i]!.index;
  }
  if (joined) {
    for (const t of descTokens) {
      if (sameToken(t.text, joined)) return t.index;
    }
  }
  return -1;
}

/** True when the phrase is present in the description with strict evidence. */
export function phraseHasDirectEvidence(phrase: string, description: string): boolean {
  const prepared = preparePhrase(phrase);
  if (!prepared) return false;
  return findPhraseIndex(prepared, tokenizeFeedback(description)) >= 0;
}

/* ------------------------------------------------------------------ */
/* Catalog matching + combination                                     */
/* ------------------------------------------------------------------ */

export type ActiveProblem = { id: string; slug: string; name_he: string };
export type CatalogAlias = { problem_id: string; alias: string };
export type SemanticEntry = { slug: string; weight?: number };

/** Internal evidence record — never exposed through `SemanticFeedback`. */
export type DirectEvidence = { slug: string; firstMatchIndex: number; matchedPhrase: string };

export type FeedbackCatalog = {
  problems: ActiveProblem[];
  aliases: CatalogAlias[];
};

/* ------------------------------------------------------------------ */
/* Catalog loading (dependency-injected, 2 fixed queries — no N+1)     */
/* ------------------------------------------------------------------ */

type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

/** Minimal structural contract of the Supabase client used here. */
export type FeedbackDb = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): Promise<QueryResult<Record<string, unknown>>>;
      in(col: string, vals: unknown[]): Promise<QueryResult<Record<string, unknown>>>;
    };
  };
};

/**
 * Load the FULL active canonical catalog plus the aliases of those active
 * problems. Exactly two queries; Supabase errors are surfaced, never
 * silently converted into an empty result.
 */
export async function loadFeedbackCatalog(db: FeedbackDb): Promise<FeedbackCatalog> {
  const problemsRes = await db.from("problems").select("id, slug, name_he").eq("is_active", true);
  if (problemsRes.error) throw new Error(`problems: ${problemsRes.error.message}`);
  const problems: ActiveProblem[] = (problemsRes.data ?? []).map((p) => ({
    id: String(p["id"]),
    slug: String(p["slug"]),
    name_he: String(p["name_he"]),
  }));

  const aliasRes = await db
    .from("problem_aliases")
    .select("problem_id, alias")
    .in("problem_id", problems.map((p) => Number(p.id)));
  if (aliasRes.error) throw new Error(`problem_aliases: ${aliasRes.error.message}`);
  const aliases: CatalogAlias[] = (aliasRes.data ?? []).map((a) => ({
    problem_id: String(a["problem_id"]),
    alias: String(a["alias"] ?? ""),
  }));

  return { problems, aliases };
}

/** Phrases (canonical name + aliases) per active slug, deterministically sorted. */
function phrasesBySlug(catalog: FeedbackCatalog): Map<string, string[]> {
  const slugById = new Map(catalog.problems.map((p) => [String(p.id), p.slug]));
  const map = new Map<string, string[]>();
  for (const p of catalog.problems) map.set(p.slug, [p.name_he]);
  for (const a of catalog.aliases) {
    const slug = slugById.get(String(a.problem_id));
    if (!slug || !a.alias) continue;
    const arr = map.get(slug);
    if (arr) arr.push(a.alias);
  }
  // Sort so alias row order from the database cannot affect results.
  for (const [slug, arr] of map) map.set(slug, [...new Set(arr)].sort());
  return map;
}

export function findDirectEvidence(
  description: string,
  catalog: FeedbackCatalog,
): DirectEvidence[] {
  const descTokens = tokenizeFeedback(description);
  if (descTokens.length === 0) return [];
  const byPhrase = phrasesBySlug(catalog);
  const out: DirectEvidence[] = [];
  for (const slug of [...byPhrase.keys()].sort()) {
    let best: DirectEvidence | null = null;
    for (const phrase of byPhrase.get(slug)!) {
      const prepared = preparePhrase(phrase);
      if (!prepared) continue;
      const idx = findPhraseIndex(prepared, descTokens);
      if (idx < 0) continue;
      if (!best || idx < best.firstMatchIndex) {
        best = { slug, firstMatchIndex: idx, matchedPhrase: phrase };
      }
    }
    if (best) out.push(best);
  }
  return out.sort(
    (a, b) => a.firstMatchIndex - b.firstMatchIndex || a.slug.localeCompare(b.slug),
  );
}

export type FeedbackDomain = { slug: string; name: string };

/** Deterministic order for semantic-only results: weight desc, then slug. */
export function orderSemanticOnly(entries: SemanticEntry[]): SemanticEntry[] {
  return [...entries].sort(
    (a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.slug.localeCompare(b.slug),
  );
}

/**
 * Union of direct evidence and validated semantic results.
 *
 * Direct matches come first (earliest occurrence, slug tie-break), then
 * semantic-only matches (weight desc, slug tie-break). Semantic results are
 * discarded unless their slug is in the ACTIVE catalog and carries strict
 * explicit evidence — so inactive slugs such as `ptsd` can never surface.
 * No truncation.
 */
export function combineFeedbackDomains(
  description: string,
  catalog: FeedbackCatalog,
  semantic: SemanticEntry[],
): FeedbackDomain[] {
  const nameBySlug = new Map(catalog.problems.map((p) => [p.slug, p.name_he]));
  const direct = findDirectEvidence(description, catalog);
  const directSlugs = new Set(direct.map((d) => d.slug));

  const phrases = phrasesBySlug(catalog);
  const semanticOnly = orderSemanticOnly(
    semantic
      .filter((e) => nameBySlug.has(e.slug) && !directSlugs.has(e.slug))
      .filter((e) =>
        (phrases.get(e.slug) ?? []).some((p) => phraseHasDirectEvidence(p, description)),
      ),
  );

  const seen = new Set<string>();
  const out: FeedbackDomain[] = [];
  for (const slug of [...direct.map((d) => d.slug), ...semanticOnly.map((e) => e.slug)]) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name: nameBySlug.get(slug) ?? slug });
  }
  return out;
}