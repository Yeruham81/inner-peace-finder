/**
 * Phase Q1 v4 — centralized therapist eligibility.
 *
 * Every query against `therapists` MUST route through `applyEligibility()`.
 * This is the SINGLE definition of "eligible" (active publication, budget,
 * suppression and claim lifecycle) and prevents drift between search paths.
 */

import type { Database } from "@/integrations/supabase/types";

export type TherapistPath = "therapists" | `therapists!inner${string}`;

export const THERAPIST_ELIGIBILITY = {
  isActive: true,
  profileStatus: "published" as Database["public"]["Enums"]["therapist_profile_status"],
  /**
   * `therapist_visibility` carries two historically equivalent "publicly
   * listed" values: `published` (what stored profiles actually use) and
   * `visible`. Both are eligible; every other value (hidden_by_owner,
   * archived, hidden) is not. Matching only one of them silently emptied
   * search results even though the profiles were live.
   */
  visibilities: ["published", "visible"] as Array<Database["public"]["Enums"]["therapist_visibility"]>,
};

/**
 * Apply eligibility to a Supabase filter-builder while preserving its full
 * generic type. Internally we cast to a permissive shape because Supabase's
 * generated `.eq` signatures require literal-type column names, which cannot
 * be expressed generically here.
 */
export function applyEligibility<Q>(builder: Q, path: TherapistPath = "therapists"): Q {
  const prefix = path === "therapists" ? "" : "therapists.";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = builder as any;
  const filtered = b
    .eq(`${prefix}is_active`, THERAPIST_ELIGIBILITY.isActive)
    .eq(`${prefix}profile_status`, THERAPIST_ELIGIBILITY.profileStatus)
    .in(`${prefix}visibility`, THERAPIST_ELIGIBILITY.visibilities);
  const automaticBudgetReset = `or(budget_hold_until.is.null,budget_hold_until.lte.${new Date().toISOString()})`;
  const claimLifecycle =
    "or(profile_origin.neq.admin_public_info," +
    "and(owner_account_id.is.null,first_contact_reserved_at.is.null,first_contact_sent_at.is.null)," +
    "and(owner_account_id.not.is.null,owner_reviewed_at.not.is.null))";
  const publicAvailability = `and(${automaticBudgetReset},do_not_republish.eq.false,${claimLifecycle})`;
  return (
    path === "therapists"
      ? filtered.or(publicAvailability)
      : filtered.or(publicAvailability, { referencedTable: "therapists" })
  ) as Q;
}

export function isEligibleRow(row: {
  is_active?: boolean | null;
  profile_status?: string | null;
  visibility?: string | null;
  budget_hold_until?: string | null;
  do_not_republish?: boolean | null;
  profile_origin?: string | null;
  owner_account_id?: string | null;
  first_contact_reserved_at?: string | null;
  first_contact_sent_at?: string | null;
  owner_reviewed_at?: string | null;
}): boolean {
  const claimLifecycleEligible =
    row.profile_origin !== "admin_public_info" ||
    (row.owner_account_id
      ? Boolean(row.owner_reviewed_at)
      : !row.first_contact_reserved_at && !row.first_contact_sent_at);

  return (
    row.is_active === true &&
    row.profile_status === THERAPIST_ELIGIBILITY.profileStatus &&
    (THERAPIST_ELIGIBILITY.visibilities as string[]).includes(row.visibility ?? "") &&
    (!row.budget_hold_until || new Date(row.budget_hold_until).getTime() <= Date.now()) &&
    row.do_not_republish !== true &&
    claimLifecycleEligible
  );
}
