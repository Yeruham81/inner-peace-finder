/**
 * Phase Q1 v4 — centralized therapist eligibility.
 *
 * Every query against `therapists` MUST route through `applyEligibility()`.
 * This is the SINGLE definition of "eligible" (is_active + published +
 * visible) and prevents drift between search paths.
 */

import type { Database } from "@/integrations/supabase/types";

export type TherapistPath = "therapists" | `therapists!inner${string}`;

export const THERAPIST_ELIGIBILITY = {
  isActive: true,
  profileStatus: "published" as Database["public"]["Enums"]["therapist_profile_status"],
  visibility: "visible" as Database["public"]["Enums"]["therapist_visibility"],
};

export function applyEligibility<Q extends { eq: (col: string, val: unknown) => Q }>(
  builder: Q,
  path: TherapistPath = "therapists",
): Q {
  const prefix = path === "therapists" ? "" : "therapists.";
  return builder
    .eq(`${prefix}is_active`, THERAPIST_ELIGIBILITY.isActive)
    .eq(`${prefix}profile_status`, THERAPIST_ELIGIBILITY.profileStatus)
    .eq(`${prefix}visibility`, THERAPIST_ELIGIBILITY.visibility);
}

export function isEligibleRow(row: {
  is_active?: boolean | null;
  profile_status?: string | null;
  visibility?: string | null;
}): boolean {
  return (
    row.is_active === true &&
    row.profile_status === THERAPIST_ELIGIBILITY.profileStatus &&
    row.visibility === THERAPIST_ELIGIBILITY.visibility
  );
}