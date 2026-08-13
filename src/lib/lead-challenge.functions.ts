import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type IssuedChallenge =
  | { ok: true; challengeId: string; prompt: string; expiresAt: string }
  | { ok: false; reason: "rate_limit_exceeded" };

/**
 * Issue a one-time, server-stored arithmetic challenge bound to the caller's
 * IP hash. The response deliberately carries no expected answer.
 */
export const issueLeadChallenge = createServerFn({ method: "POST" }).handler(async (): Promise<IssuedChallenge> => {
  const {
    deriveRequestIdentity,
    generateChallenge,
    CHALLENGE_TTL_MS,
    CHALLENGE_ISSUE_LIMIT,
    CHALLENGE_ISSUE_WINDOW_MS,
  } = await import("./lead-challenge.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { ipHash } = deriveRequestIdentity(getRequest()?.headers);

  // Housekeeping: use the service-role-only database function so the
  // retention rule remains centralized in the database migration.
  const { error: purgeErr } = await supabaseAdmin.rpc("purge_expired_lead_challenges");
  if (purgeErr) throw new Error(purgeErr.message);

  // Issuance limit per IP hash.
  const windowStart = new Date(Date.now() - CHALLENGE_ISSUE_WINDOW_MS).toISOString();
  const { count, error: countErr } = await supabaseAdmin
    .from("lead_challenges")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", windowStart);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) >= CHALLENGE_ISSUE_LIMIT) {
    return { ok: false, reason: "rate_limit_exceeded" };
  }

  const { prompt, expected } = generateChallenge();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("lead_challenges")
    .insert({ prompt, expected_answer: expected, ip_hash: ipHash, expires_at: expiresAt })
    .select("id, prompt, expires_at")
    .single();
  if (error) throw new Error(error.message);

  return { ok: true, challengeId: data.id, prompt: data.prompt, expiresAt: data.expires_at };
});
