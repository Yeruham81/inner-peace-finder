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
/** Migration that made issuance + velocity limits atomic. */
const challengeIssuanceMigration =
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .find((sql) => sql.includes("CREATE OR REPLACE FUNCTION public.issue_lead_challenge")) ?? "";
/** Latest effective migration: one atomic accepted-submission transaction. */
const submitLeadMigration =
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .filter((sql) => sql.includes("CREATE OR REPLACE FUNCTION public.submit_lead("))
    .pop() ?? "";

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
    expect(src).toMatch(/challengeId: row\.challenge_id/);
    expect(src).toMatch(/prompt: row\.prompt/);
    expect(src).toMatch(/expiresAt: row\.expires_at/);
    expect(src).not.toMatch(/expected_answer:\s*data/);
    expect(src).not.toMatch(/expectedAnswer/);
  });

  it("never reads the expected answer back from the database", () => {
    expect(src).not.toMatch(/expected_answer/);
    expect(src).not.toMatch(/row\.expected/);
  });

  it("uses the server-only admin client and server-derived IP hash", () => {
    expect(src).toContain('await import("@/integrations/supabase/client.server")');
    expect(src).toContain("deriveRequestIdentity(getRequest()?.headers)");
  });

  it("issues through one atomic database operation (purge + limit + insert)", () => {
    expect(src).toContain('.rpc("issue_lead_challenge"');
    // No application-side counting or inserting that could be raced.
    expect(src).not.toMatch(/\.from\("lead_challenges"\)/);
    expect(src).toContain("if (error) throw new Error(error.message)");
    expect(challengeIssuanceMigration).toContain("pg_advisory_xact_lock");
    expect(challengeIssuanceMigration).toMatch(/issued >= _issue_limit/);
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

  it("performs the whole accepted submission through one transactional RPC", () => {
    expect(src).toContain('.rpc("submit_lead"');
    // No split authorization / billing / insertion any more.
    expect(src).not.toContain("authorize_lead_submission");
    expect(src).not.toContain('rpc("record_cta_click"');
    expect(src).not.toContain('.from("lead_events")\n      .insert');
    expect(src).not.toContain("applyEligibility(");
    // Delivery happens only after the transaction has committed.
    expect(src.indexOf('.rpc("submit_lead"')).toBeLessThan(src.indexOf("dispatchLead"));
  });

  it("returns early on every rejection reason, before any dispatch", () => {
    const head = src.slice(0, src.indexOf("dispatchLead"));
    for (const reason of ["rate_limit_exceeded", "challenge_expired", "challenge_failed", "therapist_unavailable"]) {
      expect(head).toContain(`reason: "${reason}" as const`);
    }
  });

  it("keeps the session-based distinct-therapist limit inside the atomic transaction", () => {
    expect(src).not.toContain('.eq("session_id", sessionId)');
    expect(src).not.toContain("distinct.size >= 5");
    expect(submitLeadMigration).toContain("session_therapists >= 5");
    expect(submitLeadMigration).toContain("a.session_hash = _session_hash");
  });

  it("propagates pre-commit database errors but keeps post-commit enrichment best-effort", () => {
    expect(src).toContain("if (rpcErr) throw new Error(rpcErr.message)");
    expect(src).toContain('console.error("[lead] problem enrichment failed"');
    expect(src).toContain('console.error("[lead] population enrichment failed"');
    expect(src).not.toContain("if (pErr) throw new Error(pErr.message)");
    expect(src).not.toContain("if (popErr) throw new Error(popErr.message)");
  });

  it("keeps a committed lead successful when delivery-status persistence fails", () => {
    expect(src).toContain("if (statusErr)");
    expect(src).toContain('console.error("[lead] delivery status update failed"');
    expect(src).toContain('deliveryStatus: statusErr ? ("pending" as const) : result.status');
    expect(src).not.toContain('throw new Error("lead_status_update_failed")');
  });

  it("derives identity only through the shared server-only HMAC helper", () => {
    expect(src).toContain('await import("./lead-challenge.server")');
    expect(src).not.toContain("createHash");
    expect(src).not.toContain("SUPABASE_PROJECT_ID");
  });
});

describe("identity hashing has no static or public salt anywhere", () => {
  const files = readdirSync(join(SRC, "lib"))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => !f.includes(".test."));

  it("uses no createHash/project-id salt in identity or rate-limit code", () => {
    for (const f of files) {
      const sql = readFileSync(join(SRC, "lib", f), "utf8");
      expect(sql).not.toContain("SUPABASE_PROJECT_ID");
      if (f !== "lead-challenge.server.ts") expect(sql).not.toContain("createHash(");
    }
  });

  it("fails closed when the HMAC secret is missing or too weak", () => {
    const previous = process.env["LEAD_IDENTITY_HMAC_SECRET"];
    try {
      delete process.env["LEAD_IDENTITY_HMAC_SECRET"];
      expect(() => hashValue("1.2.3.4")).toThrow();
      process.env["LEAD_IDENTITY_HMAC_SECRET"] = "short";
      expect(() => hashValue("1.2.3.4")).toThrow();
    } finally {
      if (previous === undefined) delete process.env["LEAD_IDENTITY_HMAC_SECRET"];
      else process.env["LEAD_IDENTITY_HMAC_SECRET"] = previous;
    }
  });

  it("derives comparable hashes across the CTA, challenge and lead paths", () => {
    const cta = read("lib/therapists.functions.ts");
    const challenge = read("lib/lead-challenge.functions.ts");
    const lead = read("lib/lead.functions.ts");
    for (const sql of [cta, challenge, lead]) {
      expect(sql).toContain("deriveRequestIdentity");
    }
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9", cookie: "mt_sid=zzz" });
    const a = deriveRequestIdentity(headers);
    const b = deriveRequestIdentity(headers);
    expect(a.ipHash).toBe(b.ipHash);
    expect(a.sessionHash).toBe(b.sessionHash);
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

describe("migration: atomic submit_lead transaction", () => {
  it("is SECURITY DEFINER with an empty search_path", () => {
    expect(submitLeadMigration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.submit_lead\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/,
    );
  });

  it("leaves no privileged function on search_path = 'public'", () => {
    expect(submitLeadMigration).not.toMatch(/SET search_path = 'public'/);
    expect(submitLeadMigration).toContain("DROP FUNCTION IF EXISTS public.authorize_lead_submission");
  });

  it("is executable only by service_role", () => {
    const sig = "public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text)";
    expect(submitLeadMigration).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC`);
    expect(submitLeadMigration).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM anon, authenticated`);
    expect(submitLeadMigration).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role`);
    expect(submitLeadMigration).not.toMatch(/GRANT EXECUTE[^;]*submit_lead[^;]*TO anon/);
  });

  it("validates expiry, consumption, IP binding and the answer", () => {
    expect(submitLeadMigration).toContain("challenge.consumed_at IS NOT NULL");
    expect(submitLeadMigration).toContain("challenge.expires_at <= pg_catalog.now()");
    expect(submitLeadMigration).toContain("challenge.ip_hash IS DISTINCT FROM _ip_hash");
    expect(submitLeadMigration).toContain("challenge.expected_answer IS DISTINCT FROM _answer");
  });

  it("locks both the IP and the session identity and the challenge row", () => {
    expect(submitLeadMigration).toContain("'lead_submit_ip:' || _ip_hash");
    expect(submitLeadMigration).toContain("'lead_submit_session:' || _session_hash");
    expect(submitLeadMigration).toMatch(/SELECT \* INTO challenge FROM public\.lead_challenges c[\s\S]*?FOR UPDATE/);
  });

  it("re-checks canonical public eligibility before creating any CTA or lead", () => {
    const body = submitLeadMigration.slice(
      submitLeadMigration.indexOf("CREATE OR REPLACE FUNCTION public.submit_lead("),
    );
    const eligibility = body.indexOf("t.profile_status = 'published'");
    const cta = body.indexOf("INSERT INTO public.cta_clicks");
    const lead = body.indexOf("INSERT INTO public.lead_events");
    expect(eligibility).toBeGreaterThan(-1);
    expect(eligibility).toBeLessThan(cta);
    expect(cta).toBeLessThan(lead);
    expect(body).toContain("'therapist_unavailable'");
  });

  it("consumes the challenge, bills and creates the lead in one commit", () => {
    const body = submitLeadMigration.slice(
      submitLeadMigration.indexOf("-- From here on everything commits or rolls back together."),
    );
    expect(body).toContain("SET consumed_at = pg_catalog.now()");
    expect(body).toContain("INSERT INTO public.cta_clicks");
    expect(body).toContain("INSERT INTO public.lead_events");
    expect(body).toContain("'accepted'");
    // A single plpgsql function body is one transaction: any failure after the
    // consumption rolls the consumption, the CTA and the attempt row back.
    expect(body).not.toContain("COMMIT");
    expect(body).not.toContain("EXCEPTION WHEN");
  });

  it("keeps the exact rate limits and records every attempt", () => {
    expect(submitLeadMigration).toContain("make_interval(mins => 15)");
    expect(submitLeadMigration).toContain("attempt_count >= 10");
    expect(submitLeadMigration).toContain("distinct_therapists >= 5");
    expect(submitLeadMigration).toContain("make_interval(hours => 1)");
    expect(submitLeadMigration).toContain("accepted_same >= 3");
    expect(submitLeadMigration).toContain("INSERT INTO public.lead_submission_attempts");
  });

  it("returns only a generic reason", () => {
    expect(submitLeadMigration).toContain("RETURN QUERY SELECT false, 'rate_limit_exceeded'");
    expect(submitLeadMigration).toContain("RETURN QUERY SELECT true, 'accepted'");
    expect(submitLeadMigration).not.toContain("attempt_count::text");
  });

  it("keeps issuance atomic and the purge restricted", () => {
    expect(challengeIssuanceMigration).toContain("pg_advisory_xact_lock");
    expect(submitLeadMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.purge_expired_lead_challenges() TO service_role",
    );
  });

  it("does not weaken the previously hardened CTA function", () => {
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.record_cta_click");
    expect(submitLeadMigration).toContain("t.visibility IN ('visible', 'published')");
  });

  it("stores an empty years_experience as NULL", () => {
    expect(submitLeadMigration).toContain("ALTER COLUMN years_experience DROP NOT NULL");
    expect(submitLeadMigration).toContain("ALTER COLUMN years_experience DROP DEFAULT");
    expect(submitLeadMigration).toContain("v_years_raw !~ '^[0-9]{1,3}$'");
    expect(submitLeadMigration).toContain("years_experience = v_years");
    expect(submitLeadMigration).not.toMatch(/coalesce\(\(v_profile ->> 'years_experience'\)::integer, 0\)/);
  });
});
