import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const StartVoiceCallInput = z.object({
  therapistId: z.string().uuid(),
  phone: z.string().trim().min(6).max(32),
  challengeId: z.string().uuid(),
  challengeAnswer: z.coerce.number().int(),
});

export type StartVoiceCallResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "invalid_phone"
        | "rate_limit_exceeded"
        | "challenge_failed"
        | "challenge_expired"
        | "channel_unavailable"
        | "provider_error";
    };

/**
 * Public entry point for the phone-call channel.
 *
 * Nothing sensitive crosses the boundary: the browser sends only the visitor's
 * own number plus the existing challenge, and receives only a generic outcome.
 * The therapist's number, the Twilio call SID and the internal attempt id never
 * leave the server.
 */
export const startVoiceCall = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => StartVoiceCallInput.parse(input))
  .handler(async ({ data }): Promise<StartVoiceCallResult> => {
    const { normalizeIsraeliPhone } = await import("./phone-il");
    const visitor = normalizeIsraeliPhone(data.phone);
    if (!visitor.ok) return { ok: false, reason: "invalid_phone" };

    const request = getRequest();
    const headers = request?.headers;

    const { deriveRequestIdentity, hashValue } = await import("./lead-challenge.server");
    const { ipHash, sessionId, sessionHash } = deriveRequestIdentity(headers);
    // Only a keyed hash of the caller number is ever persisted.
    const callerHash = hashValue(`voice:${visitor.e164}`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // One transactional operation: voice rate limits, single-use challenge
    // consumption, canonical eligibility, claim gate, phone-channel check and
    // the pending (non-billable) attempt row.
    const { data: rows, error } = await supabaseAdmin.rpc("start_voice_call_attempt", {
      _challenge_id: data.challengeId,
      _answer: data.challengeAnswer,
      _ip_hash: ipHash,
      _session_hash: sessionHash,
      _session_id: sessionId,
      _caller_hash: callerHash,
      _therapist_id: data.therapistId,
    });
    if (error) {
      console.error("[voice] attempt authorization failed", { code: error.code });
      return { ok: false, reason: "provider_error" };
    }

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.allowed) {
      switch (row?.reason) {
        case "rate_limit_exceeded":
        case "active_attempt_exists":
          return { ok: false, reason: "rate_limit_exceeded" };
        case "challenge_expired":
          return { ok: false, reason: "challenge_expired" };
        case "challenge_failed":
          return { ok: false, reason: "challenge_failed" };
        default:
          // therapist_unavailable / unclaimed_profile / channel_unavailable all
          // surface as the same neutral message.
          return { ok: false, reason: "channel_unavailable" };
      }
    }

    const attemptId = row.attempt_id as string;
    const therapistPhone = normalizeIsraeliPhone(row.therapist_phone);
    if (!therapistPhone.ok) {
      await supabaseAdmin.rpc("fail_voice_call_attempt", {
        _attempt_id: attemptId,
        _error_code: "therapist_number_invalid",
      });
      return { ok: false, reason: "channel_unavailable" };
    }

    const {
      createVisitorCall,
      externalWebhookUrl,
      getTwilioConfig,
      sanitizedBase,
    } = await import("./voice-webhook-urls.server");

    let base: string;
    try {
      getTwilioConfig();
      base = request ? sanitizedBase(externalWebhookUrl(request)) : "";
      if (!base) throw new Error("origin_unavailable");
    } catch {
      await supabaseAdmin.rpc("fail_voice_call_attempt", {
        _attempt_id: attemptId,
        _error_code: "configuration_incomplete",
      });
      return { ok: false, reason: "provider_error" };
    }

    const created = await createVisitorCall({
      to: visitor.e164,
      answerUrl: `${base}/api/public/voice/answer`,
      statusCallbackUrl: `${base}/api/public/voice/parent-status`,
    });

    if (!created.ok) {
      const { sanitizeProviderError } = await import("./voice-call-billing");
      await supabaseAdmin.rpc("fail_voice_call_attempt", {
        _attempt_id: attemptId,
        _error_code: sanitizeProviderError(created.code),
      });
      if (created.missingPermission) {
        console.error("[voice] Twilio permission problem", { detail: created.missingPermission });
      }
      return { ok: false, reason: "provider_error" };
    }

    const { error: attachError } = await supabaseAdmin.rpc("attach_voice_call_provider", {
      _attempt_id: attemptId,
      _parent_call_sid: created.sid,
    });
    if (attachError) {
      console.error("[voice] provider attach failed", { code: attachError.code });
    }

    return { ok: true };
  });
