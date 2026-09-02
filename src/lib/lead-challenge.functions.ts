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
  const { deriveRequestIdentity, generateChallenge, CHALLENGE_ISSUE_LIMIT, CHALLENGE_ISSUE_WINDOW_MS } =
    await import("./lead-challenge.server");
  const [{ supabaseAdmin }, { readSystemSettings }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("./system-settings.server"),
  ]);
  const systemSettings = await readSystemSettings();

  const { ipHash } = deriveRequestIdentity(getRequest()?.headers);

  const { prompt, expected } = generateChallenge();

  // Retention purge, per-IP issuance counting and the insert all happen inside
  // one transactional, advisory-locked database operation, so parallel requests
  // from the same IP hash cannot race past the issuance limit.
  const { data: rows, error } = await supabaseAdmin.rpc("issue_lead_challenge", {
    _ip_hash: ipHash,
    _prompt: prompt,
    _expected: expected,
    _ttl_seconds: systemSettings.leadChallengeTtlMinutes * 60,
    _issue_limit: systemSettings.leadAntispamEnabled ? CHALLENGE_ISSUE_LIMIT : 2_147_483_647,
    _window_seconds: Math.round(CHALLENGE_ISSUE_WINDOW_MS / 1000),
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.allowed || !row.challenge_id || !row.expires_at) {
    return { ok: false, reason: "rate_limit_exceeded" };
  }

  return {
    ok: true,
    challengeId: row.challenge_id,
    prompt: row.prompt ?? prompt,
    expiresAt: row.expires_at,
  };
});
