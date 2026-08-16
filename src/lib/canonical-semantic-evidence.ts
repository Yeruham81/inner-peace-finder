/**
 * Exact deterministic evidence from the canonical treatment-domain catalog.
 *
 * The curated aliases are precision evidence: this module intentionally does
 * NOT use SemanticEngine.matchesText/fuzzy token overlap. A phrase contributes
 * only when its normalized complete wording occurs in the normalized query.
 */

import {
  SEMANTIC_MAX_MATCHES,
  SemanticEngine,
  type CanonicalProblemEntry,
} from "./semantic-engine";
import type { SemanticSignal } from "./query-interpreter.types";

export type ExactCanonicalEvidence = {
  slug: string;
  confidence: 1;
  kind: "name" | "alias";
  phrase: string;
  normalizedPhrase: string;
};

function containsWholeNormalizedPhrase(normalizedQuery: string, normalizedPhrase: string): boolean {
  if (!normalizedPhrase) return false;
  return ` ${normalizedQuery} `.includes(` ${normalizedPhrase} `);
}

/**
 * Return exact name/alias evidence ordered by specificity (longest normalized
 * phrase first), then slug. One slug appears at most once.
 */
export function findExactCanonicalEvidence(
  input: string,
  catalog: readonly CanonicalProblemEntry[],
  maxMatches = SEMANTIC_MAX_MATCHES,
): ExactCanonicalEvidence[] {
  const normalizedQuery = SemanticEngine.normalize(input);
  if (!normalizedQuery) return [];

  const hits: ExactCanonicalEvidence[] = [];
  for (const problem of catalog) {
    const candidates: Array<{ kind: "name" | "alias"; phrase: string }> = [
      { kind: "name", phrase: problem.name },
      ...(problem.aliases ?? []).map((phrase) => ({ kind: "alias" as const, phrase })),
    ];
    for (const candidate of candidates) {
      const normalizedPhrase = SemanticEngine.normalize(candidate.phrase);
      if (!containsWholeNormalizedPhrase(normalizedQuery, normalizedPhrase)) continue;
      hits.push({
        slug: problem.slug,
        confidence: 1,
        kind: candidate.kind,
        phrase: candidate.phrase,
        normalizedPhrase,
      });
    }
  }

  hits.sort(
    (a, b) =>
      b.normalizedPhrase.length - a.normalizedPhrase.length ||
      a.slug.localeCompare(b.slug) ||
      (a.kind === "name" ? -1 : 1),
  );

  // Precision rule for nested aliases: once a longer exact phrase has been
  // accepted, suppress a shorter phrase that is wholly contained inside it.
  // Example: "טראומה מינית" is authoritative over the nested alias
  // "טראומה"; "חרדה וגם דיכאון" still keeps both because neither phrase
  // contains the other.
  const accepted: ExactCanonicalEvidence[] = [];
  const seenSlugs = new Set<string>();
  for (const hit of hits) {
    if (seenSlugs.has(hit.slug)) continue;
    const nestedInsideAccepted = accepted.some((parent) =>
      ` ${parent.normalizedPhrase} `.includes(` ${hit.normalizedPhrase} `),
    );
    if (nestedInsideAccepted) continue;
    accepted.push(hit);
    seenSlugs.add(hit.slug);
    if (accepted.length >= Math.max(0, maxMatches)) break;
  }
  return accepted;
}

export function exactEvidenceToSignals(evidence: readonly ExactCanonicalEvidence[]): SemanticSignal[] {
  return evidence.slice(0, SEMANTIC_MAX_MATCHES).map(({ slug }) => ({ slug, confidence: 1 }));
}

/** True only when one exact canonical name/alias explains the entire remainder. */
export function hasWholeRemainderExactEvidence(
  input: string,
  evidence: readonly ExactCanonicalEvidence[],
): boolean {
  const normalized = SemanticEngine.normalize(input);
  return evidence.some((hit) => hit.normalizedPhrase === normalized);
}

/**
 * Exact evidence is authoritative. Later LLM/fallback signals may fill empty
 * slots but can never replace or lower an exact curated alias/name hit.
 */
export function mergeAuthoritativeSemanticSignals(
  exact: readonly SemanticSignal[],
  inferred: readonly SemanticSignal[],
): SemanticSignal[] {
  const merged = new Map<string, SemanticSignal>();
  for (const signal of exact) {
    if (merged.size >= SEMANTIC_MAX_MATCHES) break;
    merged.set(signal.slug, { slug: signal.slug, confidence: 1 });
  }
  for (const signal of inferred) {
    if (merged.size >= SEMANTIC_MAX_MATCHES) break;
    if (merged.has(signal.slug)) continue;
    merged.set(signal.slug, signal);
  }
  return [...merged.values()];
}
