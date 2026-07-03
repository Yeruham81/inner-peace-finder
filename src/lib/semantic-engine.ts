/**
 * Central Semantic Engine (Phase 8 — wrapper).
 *
 * Single entry point for every semantic operation in the app. This module
 * intentionally does NOT reimplement anything yet; it delegates to the
 * existing, already-tested primitives so behavior stays identical while we
 * centralize call sites.
 *
 *   normalizeText   → hebrew-normalizer (flexible/token-aware layer)
 *   extractDomains  → therapist-semantic-profile.extractProfileFromBio
 *   matchProfiles   → therapist-semantic-profile.semanticSimilarity
 *
 * Downstream modules (semantic-classifier, therapists.functions,
 * therapist-semantic-profile) route through here so Phase 10+ can swap
 * implementations from a single seam without touching call sites.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  flexibleHebrewMatch,
  lightNormalizeHebrew,
  tokenizeHebrew,
} from "./hebrew-normalizer";
import {
  extractProfileFromBio,
  parseStoredProfile,
  semanticSimilarity,
  type SemanticProfileEntry,
} from "./therapist-semantic-profile";

export type { SemanticProfileEntry };

export type UserMatch = { slug: string; confidence: number };

/**
 * Canonical normalization used everywhere before matching / caching.
 * Delegates to `lightNormalizeHebrew` (which underlies `flexibleHebrewMatch`).
 */
export function normalizeText(input: string): string {
  return lightNormalizeHebrew(input ?? "");
}

/** Re-export of the flexible matcher for callers that need boolean checks. */
export function matchesText(phrase: string, haystack: string): boolean {
  return flexibleHebrewMatch(phrase, haystack);
}

/** Re-export tokenization so callers can pull tokens without touching the normalizer directly. */
export function tokenize(input: string): string[] {
  return tokenizeHebrew(input);
}

/**
 * Extract semantic domains (problem slugs + weights) from a therapist's
 * `full_description`. Source-of-truth policy is enforced by the underlying
 * extractor — no fallback to `short_intro` / `bio_raw`.
 */
export function extractDomains(
  fullDescription: string | null | undefined,
  sb: SupabaseClient<Database>,
): Promise<SemanticProfileEntry[]> {
  return extractProfileFromBio(fullDescription, sb);
}

/**
 * Match a user's classification candidates against a therapist's stored
 * semantic profile. Returns a 0..1 similarity score.
 */
export function matchProfiles(
  userProfile: UserMatch[],
  therapistProfile: unknown,
): number {
  return semanticSimilarity(userProfile, therapistProfile);
}

/** Utility re-export — safe parsing of any stored semantic_profile blob. */
export function parseProfile(raw: unknown): SemanticProfileEntry[] {
  return parseStoredProfile(raw);
}

/**
 * Engine namespace object — convenient single import for downstream modules:
 *   import { SemanticEngine } from "./semantic-engine";
 */
export const SemanticEngine = {
  normalizeText,
  matchesText,
  tokenize,
  extractDomains,
  matchProfiles,
  parseProfile,
} as const;

export type SemanticEngineType = typeof SemanticEngine;