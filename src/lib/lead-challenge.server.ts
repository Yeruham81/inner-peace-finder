/**
 * Server-only primitives for the lead anti-spam challenge.
 *
 * Everything here runs exclusively on the server: the expected answer, the IP
 * hash and the session hash are derived here and are never accepted from, or
 * returned to, client input.
 */
import { createHmac, randomInt, randomUUID } from "crypto";

/** A challenge is valid for 10 minutes. */
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
/** Maximum challenges issued per IP hash inside a 15 minute window. */
export const CHALLENGE_ISSUE_LIMIT = 20;
export const CHALLENGE_ISSUE_WINDOW_MS = 15 * 60 * 1000;
/** Expired/old challenge rows are removed after 24 hours. */
export const CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Keyed hash of a visitor identifier. The key is a server-only secret, so the
 * mapping cannot be reproduced (or brute-forced from a known project id) by
 * anyone without the secret. A missing secret is a hard failure: silently
 * falling back to a guessable salt would make the rate limits bypassable.
 */
export function hashValue(value: string): string {
  const secret = process.env["LEAD_IDENTITY_HMAC_SECRET"];
  if (!secret || secret.length < 16) {
    throw new Error("LEAD_IDENTITY_HMAC_SECRET is not configured");
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Extract the caller IP from trusted proxy headers (never from the body). */
export function extractIp(headers: Headers | undefined | null): string {
  return (
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers?.get("x-real-ip") ||
    "0.0.0.0"
  );
}

export function extractSessionId(headers: Headers | undefined | null): string {
  const cookieHeader = headers?.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)mt_sid=([^;]+)/);
  return match?.[1] ?? randomUUID();
}

export type RequestIdentity = {
  ip: string;
  ipHash: string;
  sessionId: string;
  sessionHash: string;
  userAgent: string | null;
};

/** Derive all rate-limiting identifiers server-side. */
export function deriveRequestIdentity(headers: Headers | undefined | null): RequestIdentity {
  const ip = extractIp(headers);
  const sessionId = extractSessionId(headers);
  return {
    ip,
    ipHash: hashValue(ip),
    sessionId,
    sessionHash: hashValue(sessionId),
    userAgent: headers?.get("user-agent") ?? null,
  };
}

export type GeneratedChallenge = { prompt: string; expected: number };

/** Simple Hebrew arithmetic prompt. The expected answer never leaves the server. */
export function generateChallenge(): GeneratedChallenge {
  const a = randomInt(2, 10);
  const b = randomInt(2, 10);
  if (randomInt(0, 2) === 0) {
    return { prompt: `${a} + ${b}`, expected: a + b };
  }
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return { prompt: `${hi} - ${lo}`, expected: hi - lo };
}
