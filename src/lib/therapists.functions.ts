import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { z } from "zod";
import { applyEligibility } from "./search-eligibility";
import { filterAvailableContactMethods, resolveAvailablePreferredContactMethod } from "./contact-channel-settings";
import {
  fetchPublicTherapistBySlug,
  listEligibleFilterOptions,
  listEligibleTherapistSlugs,
} from "./public-therapist-queries";

async function publicClient() {
  // Public reads run through the server-only trusted client: `anon` has no
  // direct privileges on public.therapists. Eligibility is still applied.
  const { trustedReadClient } = await import("./trusted-read-client.server");
  return trustedReadClient();
}

export const listProblems = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await publicClient();
  const { data, error } = await sb
    .from("problems")
    .select("id, slug, description, parent_id, name:name_he")
    .eq("is_active", true)
    .order("name_he");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listFilterOptions = createServerFn({ method: "GET" }).handler(async () => {
  return listEligibleFilterOptions(await publicClient());
});

export const getProblemBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { data: problem, error: problemError } = await sb
      .from("problems")
      .select("id, slug, description, parent_id, name:name_he")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (problemError) throw new Error(problemError.message);
    if (!problem) return null;
    const { data: children, error: childrenError } = await sb
      .from("problems")
      .select("id, slug, description, name:name_he")
      .eq("parent_id", (problem as { id: string | number }).id as unknown as number)
      .eq("is_active", true)
      .order("name_he");
    if (childrenError) throw new Error(childrenError.message);
    return { ...problem, children: children ?? [] };
  });

export const getTherapistBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
    const profile = await fetchPublicTherapistBySlug(await publicClient(), data.slug);
    if (!profile) return null;

    const { readContactChannelAvailability } = await import("./contact-channel-settings.server");
    const availability = await readContactChannelAvailability();
    const contactMethods = filterAvailableContactMethods(profile.contact_methods, availability);

    return {
      ...profile,
      contact_methods: contactMethods,
      preferred_contact_method: resolveAvailablePreferredContactMethod(
        contactMethods,
        profile.preferred_contact_method,
      ),
    };
  });

export const listAllTherapistSlugs = createServerFn({ method: "GET" }).handler(async () => {
  return listEligibleTherapistSlugs(await publicClient());
});

const CtaSchema = z.object({
  therapistId: z.string().uuid(),
  sourceProblemId: z.string().uuid().nullable().optional(),
  ctaId: z.string().trim().min(1).max(64).optional(),
});

export type RecordCtaClickResult =
  | {
      ok: true;
      phone: string | null;
      sessionId: string;
      billable: boolean;
      alreadyExists: boolean;
    }
  | {
      ok: false;
      reason: "therapist_unavailable";
      phone: null;
      billable: false;
      alreadyExists: false;
    };

/**
 * Records a CTA click. Billable at most once per (therapist, session) per 24h.
 * Returns the therapist phone so the client can initiate the call.
 *
 * Contact data is released ONLY for publicly eligible therapists
 * (see `applyEligibility`). Missing and ineligible therapists are treated
 * identically and never produce a phone number or a billable CTA event.
 */
export const recordCtaClick = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CtaSchema.parse(input))
  .handler(async ({ data }): Promise<RecordCtaClickResult> => {
    const req = getRequest();
    const headers = req?.headers;
    // Identity hashes come from the single server-only HMAC helper shared by
    // the challenge and lead-submission paths. No static/public salt exists.
    const { deriveRequestIdentity } = await import("./lead-challenge.server");
    const { ipHash, sessionId, userAgent } = deriveRequestIdentity(headers);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Eligibility gate: only publicly eligible therapists may release contact
    // data or create a billable CTA event.
    const { data: therapist, error: tErr } = await applyEligibility(
      supabaseAdmin.from("therapists").select("phone").eq("id", data.therapistId),
    ).maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!therapist) {
      return {
        ok: false as const,
        reason: "therapist_unavailable" as const,
        phone: null,
        billable: false as const,
        alreadyExists: false as const,
      };
    }

    // Atomic, DB-enforced idempotency: UNIQUE(session_id, therapist_id, cta_id)
    // guarantees only the first call ever returns billable=true.
    const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc("record_cta_click", {
      _therapist_id: data.therapistId,
      _session_id: sessionId,
      _cta_id: data.ctaId ?? "primary",
      _source_problem_id: data.sourceProblemId ?? undefined,
      _ip_hash: ipHash ?? undefined,
      _user_agent: userAgent ?? undefined,
    });
    if (rpcErr) {
      if (rpcErr.message.includes("monthly_budget_exhausted")) {
        return {
          ok: false as const,
          reason: "therapist_unavailable" as const,
          phone: null,
          billable: false as const,
          alreadyExists: false as const,
        };
      }
      throw new Error(rpcErr.message);
    }
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (row?.billable) {
      try {
        const { sendBudgetExhaustedNotification } = await import("./billing-budget.server");
        await sendBudgetExhaustedNotification(data.therapistId);
      } catch (notificationError) {
        console.error("[billing-budget] CTA notification failed", {
          therapistId: data.therapistId,
          error: notificationError instanceof Error ? notificationError.message : "unknown_error",
        });
      }
    }
    return {
      ok: true as const,
      phone: therapist.phone,
      sessionId,
      billable: !!row?.billable,
      alreadyExists: !!row?.already_exists,
    };
  });
