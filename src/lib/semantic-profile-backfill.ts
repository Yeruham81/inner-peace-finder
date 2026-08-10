/**
 * One-time, guarded backfill of `therapists.semantic_profile` for legacy
 * published rows that still store a plain string array
 * (e.g. `["anxiety","depression"]`) instead of the canonical
 * `Array<{ slug, weight }>` contract.
 *
 * Safety design:
 *  - Dry run is the default: `apply` must be explicitly requested.
 *  - The ONLY writable field is `semantic_profile`.
 *  - New values come exclusively from `computeSemanticProfile`
 *    (SemanticEngine.extractProfile + serializeProfile). No second
 *    extraction algorithm, no SQL logic, no LLM.
 *  - Catalog/extraction errors are reported per row and never coerced to [].
 *  - Apply mode needs a confirmation token and an expected candidate count;
 *    drift aborts before the first write.
 *  - Each write is an atomic conditional update guarded by the originally
 *    read id / profile_status / full_description / legacy semantic_profile.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { computeSemanticProfile } from "./profile-semantic-sync";
import type { SemanticProfileEntry } from "./therapist-semantic-profile";

export const BACKFILL_CONFIRM_TOKEN = "legacy-published-semantic-profiles";

export type TherapistRow = {
  id: string;
  slug: string;
  full_name: string;
  profile_status: string;
  full_description: string | null;
  semantic_profile: unknown;
};

export type RowReport = {
  id: string;
  slug: string;
  full_name: string;
  old: unknown;
  next: SemanticProfileEntry[] | null;
  outcome: "dry_run_ok" | "updated" | "skipped_non_legacy" | "skipped_concurrent_change" | "error";
  errorCategory?: "extraction_or_catalog" | "update_failed";
  errorMessage?: string;
};

export type BackfillSummary = {
  mode: "dry-run" | "apply";
  scanned: number;
  legacyCandidates: number;
  computed: number;
  skippedNonLegacy: number;
  updated: number;
  skippedConcurrentChange: number;
  errors: number;
  writesPerformed: number;
  rows: RowReport[];
};

export type BackfillOptions = {
  apply?: boolean;
  confirmToken?: string | undefined;
  expectedCount?: number | undefined;
  /** Injectable for tests; defaults to the real computation. */
  compute?: (
    description: string | null | undefined,
    sb: SupabaseClient<Database>,
  ) => Promise<SemanticProfileEntry[]>;
};

/** Strict legacy predicate: non-empty array of strings only. */
export function isLegacyStringProfile(value: unknown): boolean {
  return (
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string")
  );
}

function safeMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export async function runSemanticProfileBackfill(
  sb: SupabaseClient<Database>,
  options: BackfillOptions = {},
): Promise<BackfillSummary> {
  const apply = options.apply === true;
  const compute = options.compute ?? computeSemanticProfile;

  if (apply) {
    if (options.confirmToken !== BACKFILL_CONFIRM_TOKEN) {
      throw new Error("apply mode blocked: missing or invalid confirmation token");
    }
    if (
      typeof options.expectedCount !== "number" ||
      !Number.isInteger(options.expectedCount) ||
      options.expectedCount < 0
    ) {
      throw new Error("apply mode blocked: missing reviewed expected count");
    }
  }

  const { data, error } = await sb
    .from("therapists")
    .select("id, slug, full_name, profile_status, full_description, semantic_profile")
    .eq("profile_status", "published");
  if (error) throw error;

  const scannedRows = (data ?? []) as unknown as TherapistRow[];
  const rows: RowReport[] = [];
  const candidates: TherapistRow[] = [];

  for (const row of scannedRows) {
    if (!isLegacyStringProfile(row.semantic_profile)) {
      rows.push({
        id: row.id,
        slug: row.slug,
        full_name: row.full_name,
        old: row.semantic_profile,
        next: null,
        outcome: "skipped_non_legacy",
      });
      continue;
    }
    candidates.push(row);
  }

  if (apply && candidates.length !== options.expectedCount) {
    throw new Error(
      `apply mode aborted before any write: candidate count drift (found ${candidates.length}, reviewed ${options.expectedCount}). Re-run the dry run.`,
    );
  }

  let computed = 0;
  let updated = 0;
  let concurrent = 0;
  let errors = 0;
  let writesPerformed = 0;

  // Sequential on purpose: bounded load, deterministic report.
  for (const row of candidates) {
    let next: SemanticProfileEntry[];
    try {
      // Always recompute from the CURRENT description just read.
      next = await compute(row.full_description, sb);
    } catch (err) {
      errors += 1;
      rows.push({
        id: row.id,
        slug: row.slug,
        full_name: row.full_name,
        old: row.semantic_profile,
        next: null,
        outcome: "error",
        errorCategory: "extraction_or_catalog",
        errorMessage: safeMessage(err),
      });
      continue;
    }
    computed += 1;

    if (!apply) {
      rows.push({
        id: row.id,
        slug: row.slug,
        full_name: row.full_name,
        old: row.semantic_profile,
        next,
        outcome: "dry_run_ok",
      });
      continue;
    }

    const query = sb
      .from("therapists")
      // The ONLY field this tool may ever write.
      .update({ semantic_profile: next } as never)
      .eq("id", row.id)
      .eq("profile_status", "published")
      // JSONB comparison must be sent as JSON text, not a coerced JS array.
      .eq("semantic_profile", JSON.stringify(row.semantic_profile) as never);
    const guarded =
      row.full_description === null
        ? query.is("full_description", null)
        : query.eq("full_description", row.full_description);

    const { data: updatedRows, error: updateError } = await guarded.select("id");
    writesPerformed += 1;

    if (updateError) {
      errors += 1;
      rows.push({
        id: row.id,
        slug: row.slug,
        full_name: row.full_name,
        old: row.semantic_profile,
        next,
        outcome: "error",
        errorCategory: "update_failed",
        errorMessage: safeMessage(updateError),
      });
      continue;
    }

    if (!updatedRows || updatedRows.length === 0) {
      // Do NOT retry with weaker conditions.
      concurrent += 1;
      rows.push({
        id: row.id,
        slug: row.slug,
        full_name: row.full_name,
        old: row.semantic_profile,
        next,
        outcome: "skipped_concurrent_change",
      });
      continue;
    }

    updated += 1;
    rows.push({
      id: row.id,
      slug: row.slug,
      full_name: row.full_name,
      old: row.semantic_profile,
      next,
      outcome: "updated",
    });
  }

  return {
    mode: apply ? "apply" : "dry-run",
    scanned: scannedRows.length,
    legacyCandidates: candidates.length,
    computed,
    skippedNonLegacy: scannedRows.length - candidates.length,
    updated,
    skippedConcurrentChange: concurrent,
    errors,
    writesPerformed: apply ? writesPerformed : 0,
    rows,
  };
}
