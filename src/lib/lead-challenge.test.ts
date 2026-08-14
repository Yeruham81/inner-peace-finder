/**
 * Server-issued, one-time lead challenge + DB-backed IP rate limiting.
 *
 * Covers: the expected answer never reaching the browser, the client payload
 * shape, the atomic authorization function's behaviour (correct / incorrect /
 * expired / consumed / foreign-IP / concurrent), rate limits, and that private
 * tables and functions are service_role-only.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  generateChallenge,
  deriveRequestIdentity,
  hashValue,
  CHALLENGE_TTL_MS,
  CHALLENGE_ISSUE_LIMIT,
} from "./lead-challenge.server";

const SRC = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const MIGRATIONS = join(SRC, "..", "supabase", "migrations");
const migrationSql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");
const challengeMigration =
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .find((sql) => sql.includes("CREATE TABLE public.lead_challenges")) ?? "";

describe("challenge generation (server-only)", () => {
  it("produces a solvable arithmetic prompt", () => {
    for (let i = 0; i < 50; i++) {
      const { prompt, expected } = generateChallenge();
      const m = prompt.match(/^(\d+) ([+-]) (\d+)$/);
      expect(m).not.toBeNull();
      const [, a, op, b] = m!;
      const value = op === "+" ? Number(a) + Number(b) : Number(a) - Number(b);
      expect(value).toBe(expected);
      expect(expected).toBeGreaterThanOrEqual(0);
    }
  });

  it("expires after 10 minutes", () => {
    expect(CHALLENGE_TTL_MS).toBe(10 * 60 * 1000);
  });

  it("limits issuance to 20 per IP window", () => {
    expect(CHALLENGE_ISSUE_LIMIT).toBe(20);
  });
});

describe("server-derived identity", () => {
  it("derives the IP hash from proxy headers, never from client input", () => {
    const id = deriveRequestIdentity(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", cookie: "mt_sid=abc" }));
    expect(id.ip).toBe("203.0.113.7");
    expect(id.ipHash).toBe(hashValue("203.0.113.7"));
    expect(id.sessionHash).toBe(hashValue("abc"));
    // raw IP is never stored: only the hash is passed to the database
    expect(id.ipHash).not.toContain("203.0.113.7");
  });

  it("falls back to a random session when the cookie is absent or rotated", () => {
    const a = deriveRequestIdentity(new Headers({ "x-real-ip": "198.51.100.4" }));
    const b = deriveRequestIdentity(new Headers({ "x-real-ip": "198.51.100.4" }));
    expect(a.sessionHash).not.toBe(b.sessionHash);
    // the IP hash is stable, so the IP limit still applies across cookie rotation
    expect(a.ipHash).toBe(b.ipHash);
  });
});

describe("issuance response never leaks the answer", () => {
  const src = read("lib/lead-challenge.functions.ts");

  it("returns only challengeId, prompt and expiresAt", () => {
    expect(src).toMatch(/challengeId: data\.id/);
    expect(src).toMatch(/prompt: data\.prompt/);
    expect(src).toMatch(/expiresAt: data\.expires_at/);
    expect(src).not.toMatch(/expected_answer:\s*data/);
    expect(src).not.toMatch(/expectedAnswer/);
  });

  it("selects only non-secret columns from the challenge row", () => {
    expect(src).toContain('.select("id, prompt, expires_at")');
    expect(src).not.toMatch(/select\([^)]*expected_answer/);
  });

  it("uses the server-only admin client and server-derived IP hash", () => {
    expect(src).toContain('await import("@/integrations/supabase/client.server")');
    expect(src).toContain("deriveRequestIdentity(getRequest()?.headers)");
  });

  it("runs the database retention cleanup before issuing a new challenge", () => {
    const purge = src.indexOf('.rpc("purge_expired_lead_challenges")');
    const insert = src.search(/\.from\("lead_challenges"\)\s*\.insert\(/);

    expect(purge).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(purge).toBeLessThan(insert);
    expect(src).toContain("if (purgeErr) throw new Error(purgeErr.message)");
  });
});

describe("createLead client contract", () => {
  const src = read("lib/lead.functions.ts");
  const modal = read("components/lead-modal.tsx");

  it("accepts only challengeId + challengeAnswer", () => {
    expect(src).toContain("challengeId: z.string().uuid()");
    expect(src).toContain("challengeAnswer: z.coerce.number().int()");
    expect(src).not.toContain("challengeExpected");
    expect(src).not.toContain("challengePresented: z");
  });

  it("no longer trusts a client-side comparison", () => {
    expect(src).not.toContain("passesChallenge");
    expect(modal).not.toContain("challengeExpected");
    expect(modal).not.toContain("challenge.expected");
    expect(modal).not.toContain("makeChallenge");
  });

  it("authorizes before billing, insertion and dispatch", () => {
    const auth = src.indexOf("authorize_lead_submission");
    const eligibility = src.indexOf("applyEligibility(");
    const cta = src.indexOf("record_cta_click");
    const insert = src.indexOf('.from("lead_events")\n      .insert');
    const dispatch = src.indexOf("dispatchLead");
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(eligibility);
    expect(eligibility).toBeLessThan(cta);
    expect(cta).toBeLessThan(insert);
    expect(insert).toBeLessThan(dispatch);
  });

  it("returns early on every rejection reason, before any side effect", () => {
    const head = src.slice(0, src.indexOf("record_cta_click"));
    for (const reason of ["rate_limit_exceeded", "challenge_expired", "challenge_failed"]) {
      expect(head).toContain(`reason: "${reason}" as const`);
    }
    // eligibility enforcement preserved
    expect(src).toContain('reason: "therapist_unavailable" as const');
    expect(src).toContain("applyEligibility(");
  });

  it("preserves the session-based distinct-therapist limit", () => {
    expect(src).toContain('.eq("session_id", sessionId)');
    expect(src).toContain("distinct.size >= 5");
  });

  it("propagates unexpected database errors", () => {
    expect(src).toContain("if (authErr) throw new Error(authErr.message)");
  });
});

describe("modal challenge lifecycle", () => {
  const modal = read("components/lead-modal.tsx");

  it("requests a challenge from the server when it opens", () => {
    expect(modal).toContain("issueLeadChallenge");
    expect(modal).toContain("void requestChallenge()");
  });

  it("blocks submission while the challenge is loading or missing", () => {
    expect(modal).toContain("challenge !== null");
    expect(modal).toContain("!challengeLoading");
    expect(modal).toContain("disabled={challengeLoading || challenge === null}");
  });

  it("shows generic Hebrew errors and re-requests a fresh challenge", () => {
    expect(modal).toContain("האימות נכשל. נסו לפתור את התרגיל החדש.");
    expect(modal).toContain("תוקף האימות פג. הוצג תרגיל חדש.");
    expect(modal).toContain("נשלחו מספר פניות בזמן קצר. ניתן לנסות שוב מאוחר יותר.");
    const submitTail = modal.slice(modal.indexOf("CHALLENGE_ERROR_MESSAGES.failed,"));
    expect(submitTail).toContain('setChallengeAnswer("")');
    expect(submitTail).toContain("void requestChallenge()");
  });

  it("keeps the success + return-to-search flow", () => {
    expect(modal).toContain("LEAD_SUCCESS_REDIRECT_MS");
    expect(modal).toContain("returnToResults");
  });
});

describe("migration: private tables", () => {
  it("creates both tables with the required columns", () => {
    expect(challengeMigration).toContain("CREATE TABLE public.lead_challenges");
    expect(challengeMigration).toContain("expected_answer integer NOT NULL");
    expect(challengeMigration).toContain("consumed_at timestamptz NULL");
    expect(challengeMigration).toContain("CREATE TABLE public.lead_submission_attempts");
    expect(challengeMigration).toContain("session_hash text NOT NULL");
  });

  it("enables RLS with no anon/authenticated policies and revokes access", () => {
    expect(challengeMigration).toContain("ALTER TABLE public.lead_challenges ENABLE ROW LEVEL SECURITY");
    expect(challengeMigration).toContain("ALTER TABLE public.lead_submission_attempts ENABLE ROW LEVEL SECURITY");
    expect(challengeMigration).toContain("REVOKE ALL ON public.lead_challenges FROM anon, authenticated");
    expect(challengeMigration).toContain("REVOKE ALL ON public.lead_submission_attempts FROM anon, authenticated");
    expect(challengeMigration).toContain("GRANT ALL ON public.lead_challenges TO service_role");
    expect(challengeMigration).not.toMatch(/CREATE POLICY[^;]*lead_challenges/);
    expect(challengeMigration).not.toMatch(/CREATE POLICY[^;]*lead_submission_attempts/);
  });

  it("indexes the time-window, IP and therapist lookups", () => {
    expect(challengeMigration).toContain("idx_lead_challenges_ip_created");
    expect(challengeMigration).toContain("idx_lead_attempts_ip_created");
    expect(challengeMigration).toContain("idx_lead_attempts_therapist_created");
  });

  it("never exposes the tables through a public client", () => {
    const clientRefs = readdirSync(join(SRC, "lib"))
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) => !f.includes(".server.") && !f.includes(".test."))
      .filter((f) => {
        const sql = readFileSync(join(SRC, "lib", f), "utf8");
        return (
          (sql.includes("lead_challenges") || sql.includes("lead_submission_attempts")) &&
          !sql.includes("client.server")
        );
      });
    expect(clientRefs).toEqual([]);
  });
});

describe("migration: authorize_lead_submission", () => {
  it("is SECURITY DEFINER with a fixed search_path", () => {
    expect(challengeMigration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.authorize_lead_submission[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/,
    );
  });

  it("is executable only by service_role", () => {
    expect(challengeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.authorize_lead_submission(uuid, integer, text, text, uuid) FROM PUBLIC",
    );
    expect(challengeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.authorize_lead_submission(uuid, integer, text, text, uuid) FROM anon, authenticated",
    );
    expect(challengeMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.authorize_lead_submission(uuid, integer, text, text, uuid) TO service_role",
    );
  });

  it("validates existence, expiry, consumption, IP binding and the answer", () => {
    expect(challengeMigration).toContain("challenge.consumed_at IS NOT NULL");
    expect(challengeMigration).toContain("challenge.expires_at <= now()");
    expect(challengeMigration).toContain("challenge.ip_hash IS DISTINCT FROM _ip_hash");
    expect(challengeMigration).toContain("challenge.expected_answer IS DISTINCT FROM _answer");
  });

  it("serializes concurrent consumption with a row lock", () => {
    expect(challengeMigration).toMatch(/SELECT \* INTO challenge FROM public\.lead_challenges c[\s\S]*?FOR UPDATE/);
    expect(challengeMigration).toContain("SET consumed_at = now()");
  });

  it("implements the exact IP limits and records every attempt", () => {
    expect(challengeMigration).toContain("interval '15 minutes'");
    expect(challengeMigration).toContain("attempt_count >= 10");
    expect(challengeMigration).toContain("distinct_therapists >= 5");
    expect(challengeMigration).toContain("interval '1 hour'");
    expect(challengeMigration).toContain("accepted_same >= 3");
    expect(challengeMigration).toContain("INSERT INTO public.lead_submission_attempts");
  });

  it("returns only a generic reason", () => {
    expect(challengeMigration).toContain("RETURN QUERY SELECT false, 'rate_limit_exceeded'");
    expect(challengeMigration).toContain("RETURN QUERY SELECT true, 'accepted'");
    expect(challengeMigration).not.toContain("attempt_count::text");
  });

  it("purges old challenge rows and restricts the purge function", () => {
    expect(challengeMigration).toContain("interval '24 hours'");
    expect(challengeMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.purge_expired_lead_challenges() TO service_role",
    );
  });

  it("does not weaken the previously hardened CTA function", () => {
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.record_cta_click");
  });
});
