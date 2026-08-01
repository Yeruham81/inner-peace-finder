/**
 * Phase Q2 — deterministic, versioned prompt builder for FUTURE semantic
 * classification of `semanticRemainder`. No model is invoked here.
 *
 * Any behavioral change to the prompt REQUIRES bumping
 * `LLM_SEMANTIC_PROMPT_VERSION`.
 */

import { LLM_SEMANTIC_MAX_MATCHES, type CanonicalProblemEntry } from "./llm-semantic-contract";

export const LLM_SEMANTIC_PROMPT_VERSION = "q2-semantic-v1";

/**
 * Compact, deterministic catalog rendering: one row per problem, sorted by
 * slug so input ordering can never change the prompt. Aliases are included
 * (comma-joined, sorted) purely as recognition hints — an alias is NEVER a
 * valid output value.
 */
export function formatProblemCatalog(problems: readonly CanonicalProblemEntry[]): string {
  return [...problems]
    .filter((p) => typeof p?.slug === "string" && p.slug.length > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => {
      const aliases = [...new Set(p.aliases ?? [])].sort().join(", ");
      const name = (p.name ?? "").trim();
      return `${p.slug}|${name}${aliases ? `|${aliases}` : ""}`;
    })
    .join("\n");
}

export const LLM_SEMANTIC_SYSTEM_PROMPT = [
  "You classify ONLY the unresolved semantic meaning of a Hebrew search remainder into canonical problem slugs.",
  "",
  "Rules:",
  "- Choose slugs ONLY from the supplied catalog. Never invent, translate or modify a slug.",
  "- Output the slug, never a display name and never an alias.",
  `- Return at most ${LLM_SEMANTIC_MAX_MATCHES} matches.`,
  "- Return zero matches when uncertain. Prefer abstention over speculation.",
  "- Do NOT extract cities, professions, therapist gender, languages, populations, treatment modalities, delivery modes or therapist names.",
  "- Do NOT recommend treatment. Do NOT rank or mention therapists.",
  "- Do NOT write prose, explanations, markdown or code fences.",
  "",
  'Respond with exactly one JSON object: {"matches":[{"slug":"<canonical-slug>","confidence":<0..1>}],"abstained":<true|false>}',
  'When you have no confident match, respond with {"matches":[],"abstained":true}.',
].join("\n");

export type LlmSemanticPrompt = {
  promptVersion: string;
  system: string;
  user: string;
};

/** Build the deterministic prompt for one remainder + catalog. */
export function buildLlmSemanticPrompt(input: {
  semanticRemainder: string;
  allowedProblems: readonly CanonicalProblemEntry[];
}): LlmSemanticPrompt {
  const user = [
    "CATALOG (slug|name|aliases):",
    formatProblemCatalog(input.allowedProblems),
    "",
    "REMAINDER:",
    input.semanticRemainder.trim(),
  ].join("\n");
  return { promptVersion: LLM_SEMANTIC_PROMPT_VERSION, system: LLM_SEMANTIC_SYSTEM_PROMPT, user };
}