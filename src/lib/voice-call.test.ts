import { describe, expect, it } from "bun:test";
import { createHmac } from "crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { normalizeIsraeliPhone, looksLikeIsraeliPhone } from "./phone-il";
import {
  isBillableCallback,
  sanitizeProviderError,
  therapistLegAnswered,
  therapistLegNonBillableTerminal,
} from "./voice-call-billing";
import {
  buildBridgeTwiml,
  buildHangupTwiml,
  computeTwilioSignature,
  parseTwilioForm,
  signedWebhookUrl,
  trustedVoiceOrigin,
  validateTwilioSignature,
  voiceCallbackUrl,
} from "./twilio-voice.server";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "supabase", "migrations");

function voiceMigration(): string {
  const file = readdirSync(MIGRATIONS_DIR).find((name) => {
    if (!name.endsWith(".sql")) return false;
    return readFileSync(join(MIGRATIONS_DIR, name), "utf8").includes("start_voice_call_attempt");
  });
  if (!file) throw new Error("voice migration not found");
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}

function noAmdMigration(): string {
  return readFileSync(join(MIGRATIONS_DIR, "20260825010000_voice_caller_bridge_without_amd.sql"), "utf8");
}

describe("Israeli phone normalization", () => {
  it("accepts the familiar local mobile and landline formats", () => {
    for (const input of [
      "050-123-4567",
      "050‑123‑4567",
      "050–123–4567",
      "050־123־4567",
      "0501234567",
      "+972501234567",
      "00972 50 123 4567",
      "(03) 123-4567",
    ]) {
      expect(normalizeIsraeliPhone(input).ok).toBe(true);
    }
    expect(normalizeIsraeliPhone("050-123-4567")).toEqual({ ok: true, e164: "+972501234567" });
  });

  it("rejects premium, service and non-Israeli destinations", () => {
    expect(normalizeIsraeliPhone("1-900-123456").ok).toBe(false);
    expect(normalizeIsraeliPhone("1800123456").ok).toBe(false);
    expect(normalizeIsraeliPhone("+14155552671").ok).toBe(false);
    expect(normalizeIsraeliPhone("").ok).toBe(false);
    expect(normalizeIsraeliPhone("not a phone").ok).toBe(false);
    expect(looksLikeIsraeliPhone("050")).toBe(false);
  });
});

describe("billing decision", () => {
  it("bills exactly once, only on a therapist-leg answer", () => {
    expect(isBillableCallback({ leg: "therapist", status: "answered", alreadyBilled: false })).toBe(true);
    expect(isBillableCallback({ leg: "therapist", status: "in-progress", alreadyBilled: false })).toBe(true);
    expect(isBillableCallback({ leg: "therapist", status: "answered", alreadyBilled: true })).toBe(false);
  });

  it("treats voicemail, IVR and receptionist answers as billable answers", () => {
    // All of these arrive as a plain therapist-leg answer; no screening is applied.
    expect(therapistLegAnswered("answered")).toBe(true);
    expect(therapistLegAnswered("completed")).toBe(true);
  });

  it("never bills failed therapist legs regardless of duration", () => {
    for (const status of ["busy", "no-answer", "failed", "canceled"]) {
      expect(therapistLegNonBillableTerminal(status)).toBe(true);
      expect(isBillableCallback({ leg: "therapist", status, alreadyBilled: false })).toBe(false);
    }
  });

  it("never bills a visitor-leg event, even a long completed parent call", () => {
    expect(isBillableCallback({ leg: "caller", status: "completed", alreadyBilled: false })).toBe(false);
    expect(isBillableCallback({ leg: "caller", status: "answered", alreadyBilled: false })).toBe(false);
  });

  it("stores provider errors as sanitized codes only", () => {
    expect(sanitizeProviderError(21215)).toBe("21215");
    expect(sanitizeProviderError("+972501234567 rejected")).toBe("972501234567rejected");
    expect(sanitizeProviderError(undefined)).toBe("unknown");
  });
});

describe("webhook signature validation", () => {
  const token = "test_auth_token_value";
  const url = "https://example.com/api/public/voice/therapist-status";

  it("matches Twilio's documented HMAC-SHA1 scheme over url + sorted params", () => {
    const params = { CallStatus: "answered", ParentCallSid: "CA1", CallSid: "CA2" };
    const manual = createHmac("sha1", token)
      .update(Buffer.from(`${url}CallSidCA2CallStatusansweredParentCallSidCA1`, "utf8"))
      .digest("base64");
    expect(computeTwilioSignature(token, url, params)).toBe(manual);
    expect(validateTwilioSignature({ authToken: token, url, params, signature: manual })).toBe(true);
  });

  it("rejects a tampered payload, a wrong url and a missing signature", () => {
    const params = { CallStatus: "answered", CallSid: "CA2" };
    const signature = computeTwilioSignature(token, url, params);
    expect(
      validateTwilioSignature({ authToken: token, url, params: { ...params, CallStatus: "busy" }, signature }),
    ).toBe(false);
    expect(validateTwilioSignature({ authToken: token, url: `${url}?x=1`, params, signature })).toBe(false);
    expect(validateTwilioSignature({ authToken: token, url, params, signature: null })).toBe(false);
    expect(validateTwilioSignature({ authToken: "other", url, params, signature })).toBe(false);
  });

  it("parses the complete form payload used for signing", () => {
    expect(parseTwilioForm("CallSid=CA1&CallStatus=no-answer&Extra=%2B972")).toEqual({
      CallSid: "CA1",
      CallStatus: "no-answer",
      Extra: "+972",
    });
  });

  it("signs against the trusted origin, ignoring forwarded headers", () => {
    const previous = process.env["TIPULINKS_PUBLIC_ORIGIN"];
    process.env["TIPULINKS_PUBLIC_ORIGIN"] = "https://tipulinks.co.il";
    try {
      const request = new Request("http://localhost:8080/api/public/voice/answer?b=2&a=%2B1", {
        method: "POST",
        headers: { "x-forwarded-proto": "http", "x-forwarded-host": "attacker.example" },
      });
      // Origin from env; pathname + raw query preserved verbatim (order + encoding).
      expect(signedWebhookUrl(request)).toBe("https://tipulinks.co.il/api/public/voice/answer?b=2&a=%2B1");
    } finally {
      if (previous === undefined) delete process.env["TIPULINKS_PUBLIC_ORIGIN"];
      else process.env["TIPULINKS_PUBLIC_ORIGIN"] = previous;
    }
  });
});

describe("Twilio Voice URLs never depend on request headers", () => {
  const CALLBACK_PATHS = [
    "/api/public/voice/answer",
    "/api/public/voice/parent-status",
    "/api/public/voice/therapist-status",
    "/api/public/voice/dial-action",
  ];

  function withOrigin<T>(value: string | undefined, run: () => T): T {
    const previous = process.env["TIPULINKS_PUBLIC_ORIGIN"];
    if (value === undefined) delete process.env["TIPULINKS_PUBLIC_ORIGIN"];
    else process.env["TIPULINKS_PUBLIC_ORIGIN"] = value;
    try {
      return run();
    } finally {
      if (previous === undefined) delete process.env["TIPULINKS_PUBLIC_ORIGIN"];
      else process.env["TIPULINKS_PUBLIC_ORIGIN"] = previous;
    }
  }

  it("builds every outgoing callback URL from TIPULINKS_PUBLIC_ORIGIN", () => {
    withOrigin("https://tipulinks.co.il", () => {
      for (const path of CALLBACK_PATHS) {
        expect(voiceCallbackUrl(path)).toBe(`https://tipulinks.co.il${path}`);
      }
      expect(trustedVoiceOrigin()).toBe("https://tipulinks.co.il");
    });
  });

  it("cannot be influenced by X-Forwarded-Host or X-Forwarded-Proto", () => {
    withOrigin("https://tipulinks.co.il", () => {
      const request = new Request("http://localhost:8080/api/public/voice/answer", {
        method: "POST",
        headers: {
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "http",
          host: "attacker.example",
          origin: "https://attacker.example",
          referer: "https://attacker.example/x",
        },
      });
      for (const path of CALLBACK_PATHS) {
        const url = voiceCallbackUrl(path);
        expect(url.startsWith("https://tipulinks.co.il/")).toBe(true);
        expect(url).not.toContain("attacker.example");
      }
      expect(signedWebhookUrl(request)).toBe("https://tipulinks.co.il/api/public/voice/answer");
    });
  });

  it("fails closed on a missing, malformed or non-https origin", () => {
    for (const bad of [
      undefined,
      "",
      "not a url",
      "http://tipulinks.co.il",
      "https://user:pass@tipulinks.co.il",
      "https://tipulinks.co.il/nested/path",
      "https://tipulinks.co.il/?a=1",
      "https://tipulinks.co.il/#frag",
    ]) {
      withOrigin(bad, () => {
        expect(() => trustedVoiceOrigin()).toThrow();
        expect(() => voiceCallbackUrl("/api/public/voice/answer")).toThrow();
      });
    }
  });

  it("keeps the header-based URL helper out of the voice flow", () => {
    const files = [
      "twilio-voice.server.ts",
      "voice-call.functions.ts",
      join("..", "routes", "api", "public", "voice", "answer.ts"),
      join("..", "routes", "api", "public", "voice", "parent-status.ts"),
      join("..", "routes", "api", "public", "voice", "therapist-status.ts"),
      join("..", "routes", "api", "public", "voice", "dial-action.ts"),
    ];
    for (const file of files) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      expect(source).not.toContain("externalWebhookUrl");
      expect(source).not.toContain("x-forwarded-host");
      expect(source).not.toContain("x-forwarded-proto");
    }
  });
});

describe("bridge TwiML", () => {
  const xml = buildBridgeTwiml({
    therapistPhone: "+972501112222",
    callerId: "+972720000000",
    therapistStatusCallbackUrl: "https://x.co/api/public/voice/therapist-status",
    dialActionUrl: "https://x.co/api/public/voice/dial-action",
  });

  it("bridges one server-provided number with the platform caller id", () => {
    expect(xml).toContain('callerId="+972720000000"');
    expect(xml.match(/<Number/g)?.length).toBe(1);
    expect(xml).toContain(">+972501112222</Number>");
    expect(xml).toContain('answerOnBridge="true"');
  });

  it("never records, never transcribes and never screens the answer", () => {
    expect(xml).toContain('record="do-not-record"');
    expect(xml).not.toContain("<Gather");
    expect(xml).not.toContain("<Conference");
    expect(xml).not.toContain("Transcribe");
    expect(xml).not.toContain("MachineDetection");
  });

  it("hangs up without dialing when the therapist destination is unavailable", () => {
    expect(buildHangupTwiml()).toContain("<Hangup/>");
    expect(buildHangupTwiml()).not.toContain("<Dial");
  });
});

describe("visitor leg bridges without human-answer detection", () => {
  const serverSource = readFileSync(join(import.meta.dir, "twilio-voice.server.ts"), "utf8");
  const answerSource = readFileSync(
    join(import.meta.dir, "..", "routes", "api", "public", "voice", "answer.ts"),
    "utf8",
  );
  const sql = noAmdMigration();

  it("does not ask Twilio to listen for a human voice on the first leg", () => {
    expect(serverSource).not.toContain('body.set("MachineDetection"');
    expect(serverSource).not.toContain('body.set("MachineDetectionTimeout"');
    expect(answerSource).not.toContain('verified.params["AnsweredBy"]');
    expect(answerSource).not.toContain("visitorAnswerIsHuman");
    expect(answerSource).toContain('_amd_result: "disabled"');
  });

  it("normalizes the database destination to E.164 before Twilio receives it", () => {
    expect(answerSource).toContain("normalizeIsraeliPhone(row.therapist_phone)");
    expect(answerSource).toContain("therapistPhone: therapistPhone.e164");
  });

  it("keeps the caller-answer RPC signature but removes the old AMD gate", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.voice_call_caller_answered(");
    expect(sql).toContain("caller_amd_result = 'disabled'");
    expect(sql).not.toContain("visitor_not_human");
    expect(sql).not.toContain("<> 'human'");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain("TO service_role");
  });
});

describe("no phone number reaches the browser", () => {
  it("keeps the phone contact method off the direct-release server function", () => {
    const source = readFileSync(join(import.meta.dir, "contact-actions.functions.ts"), "utf8");
    expect(source).toContain('z.enum(["whatsapp"])');
  });

  it("returns only a generic outcome from the call initiation function", () => {
    const source = readFileSync(join(import.meta.dir, "voice-call.functions.ts"), "utf8");
    expect(source).not.toMatch(/return\s*{\s*ok:\s*true,\s*[a-zA-Z]+:/);
    expect(source).toContain("return { ok: true };");
    // The caller number is only ever persisted as a keyed hash.
    expect(source).toContain("hashValue(`voice:${visitor.e164}`)");
  });
});

describe("voice migration invariants", () => {
  const sql = voiceMigration();

  it("keeps call sessions private to the service role", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/GRANT[\s\S]*voice_call_sessions[\s\S]*service_role/);
    expect(sql).not.toMatch(/GRANT[^;]*voice_call_sessions[^;]*TO\s+anon/i);
  });

  it("hardens every voice RPC with an empty search_path", () => {
    const definers = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect((sql.match(/SET search_path = ''/g) ?? []).length).toBeGreaterThanOrEqual(definers.length);
  });

  it("re-checks eligibility and the claim gate before releasing a number", () => {
    expect(sql).toContain("profile_status");
    expect(sql).toContain("do_not_republish");
    expect(sql).toContain("admin_public_info");
  });

  it("uses advisory locks for the voice rate limits", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
  });
});
