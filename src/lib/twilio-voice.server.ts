/**
 * Server-only Twilio Voice access for the phone-call channel.
 *
 * Credential rules enforced here:
 *  - Outgoing Calls API requests authenticate with the **restricted API key**
 *    (`TWILIO_API_KEY_SID` : `TWILIO_API_KEY_SECRET`) against the account
 *    context `TWILIO_ACCOUNT_SID`. The account auth token is never used for
 *    outgoing requests.
 *  - `TWILIO_AUTH_TOKEN` is used exclusively to validate `X-Twilio-Signature`
 *    on inbound webhooks.
 *  - Only `POST /2010-04-01/Accounts/{Sid}/Calls.json` is called. No Read,
 *    List, Update, Delete, Phone Numbers, Messaging, Conference, Recording,
 *    Transcription, Verify, Lookup, Studio or SIP endpoints are touched, so the
 *    restricted key needs nothing beyond "create Voice Call resources".
 *  - No secret value is ever returned or logged.
 */
import { createHmac, timingSafeEqual } from "crypto";

export type TwilioConfig = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  authToken: string;
  phoneNumber: string;
};

/** Read credentials at call time (never at module scope). Fails closed. */
export function getTwilioConfig(): TwilioConfig {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const apiKeySid = process.env["TWILIO_API_KEY_SID"];
  const apiKeySecret = process.env["TWILIO_API_KEY_SECRET"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const phoneNumber = process.env["TWILIO_PHONE_NUMBER"];

  if (!accountSid || !apiKeySid || !apiKeySecret || !authToken || !phoneNumber) {
    // Names only — never values.
    const missing = [
      ...(!accountSid ? ["TWILIO_ACCOUNT_SID"] : []),
      ...(!apiKeySid ? ["TWILIO_API_KEY_SID"] : []),
      ...(!apiKeySecret ? ["TWILIO_API_KEY_SECRET"] : []),
      ...(!authToken ? ["TWILIO_AUTH_TOKEN"] : []),
      ...(!phoneNumber ? ["TWILIO_PHONE_NUMBER"] : []),
    ];
    throw new Error(`Twilio voice configuration incomplete: ${missing.join(", ")}`);
  }

  return { accountSid, apiKeySid, apiKeySecret, authToken, phoneNumber };
}

/** Ringing timeout for either leg, and the hard cap on a bridged call. */
export const DIAL_TIMEOUT_SECONDS = 30;
export const MAX_CALL_DURATION_SECONDS = 1800;
export const MACHINE_DETECTION_TIMEOUT_SECONDS = 15;

export type CreateCallResult =
  | { ok: true; sid: string }
  | { ok: false; code: string; missingPermission?: string };

/**
 * Create the FIRST (visitor) leg through the Calls REST API. The therapist leg
 * is created later by TwiML `<Dial><Number>`, never by this API.
 *
 * Synchronous Answering Machine Detection is requested for this leg only, so
 * the TwiML webhook receives `AnsweredBy` and can refuse to dial the therapist
 * when the visitor's voicemail answered.
 */
export async function createVisitorCall(params: {
  to: string;
  answerUrl: string;
  statusCallbackUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<CreateCallResult> {
  const config = getTwilioConfig();
  const body = new URLSearchParams();
  body.set("To", params.to);
  body.set("From", config.phoneNumber);
  body.set("Url", params.answerUrl);
  body.set("Method", "POST");
  body.set("StatusCallback", params.statusCallbackUrl);
  body.set("StatusCallbackMethod", "POST");
  body.append("StatusCallbackEvent", "initiated");
  body.append("StatusCallbackEvent", "ringing");
  body.append("StatusCallbackEvent", "answered");
  body.append("StatusCallbackEvent", "completed");
  body.set("Timeout", String(DIAL_TIMEOUT_SECONDS));
  body.set("TimeLimit", String(MAX_CALL_DURATION_SECONDS));
  body.set("MachineDetection", "Enable");
  body.set("MachineDetectionTimeout", String(MACHINE_DETECTION_TIMEOUT_SECONDS));
  body.set("Record", "false");

  const authorization = `Basic ${Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString("base64")}`;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`;
  const doFetch = params.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch {
    return { ok: false, code: "network_error" };
  }

  const text = await response.text();
  if (!response.ok) {
    let code = String(response.status);
    let message = "";
    try {
      const parsed = JSON.parse(text) as { code?: number; message?: string };
      if (parsed.code) code = String(parsed.code);
      message = parsed.message ?? "";
    } catch {
      /* keep the status code */
    }
    // Report a missing-permission problem precisely, without requesting a
    // broader key: the only endpoint we use is Calls create.
    const missingPermission =
      response.status === 401 || response.status === 403 || code === "20005"
        ? `POST /2010-04-01/Accounts/{AccountSid}/Calls.json requires the restricted key permission "Voice: Calls — Create". Provider said: ${message.slice(0, 160)}`
        : undefined;
    console.error("[voice] Twilio call creation failed", { status: response.status, code, missingPermission });
    return { ok: false, code, ...(missingPermission ? { missingPermission } : {}) };
  }

  try {
    const parsed = JSON.parse(text) as { sid?: string };
    if (!parsed.sid) return { ok: false, code: "missing_sid" };
    return { ok: true, sid: parsed.sid };
  } catch {
    return { ok: false, code: "bad_response" };
  }
}

/* -------------------------------------------------------------------------- */
/* Webhook security                                                            */
/* -------------------------------------------------------------------------- */

/** Parse an `application/x-www-form-urlencoded` Twilio payload completely. */
export function parseTwilioForm(bodyText: string): Record<string, string> {
  const params = new URLSearchParams(bodyText);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

/**
 * Twilio's documented signature scheme: HMAC-SHA1 over the exact externally
 * visible URL (including query string) followed by every POST parameter
 * name+value in lexicographic key order, base64 encoded.
 *
 * Implemented directly because the official `twilio` Node helper is not
 * compatible with this Worker runtime; the algorithm is byte-identical to
 * `twilio.validateRequest`.
 */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function validateTwilioSignature(input: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string | null;
}): boolean {
  if (!input.signature) return false;
  const expected = computeTwilioSignature(input.authToken, input.url, input.params);
  const provided = Buffer.from(input.signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (provided.length !== expectedBuf.length) return false;
  return timingSafeEqual(provided, expectedBuf);
}

/**
 * The ONLY trusted origin for Twilio Voice URLs: the server-side
 * `TIPULINKS_PUBLIC_ORIGIN` env var. Request headers (`Host`,
 * `X-Forwarded-Host`, `X-Forwarded-Proto`, `Origin`, `Referer`, ...) are never
 * consulted, so a spoofed header cannot redirect a callback. Fails closed.
 */
export function trustedVoiceOrigin(): string {
  const configured = process.env["TIPULINKS_PUBLIC_ORIGIN"];
  if (!configured) throw new Error("TIPULINKS_PUBLIC_ORIGIN is not configured");

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("TIPULINKS_PUBLIC_ORIGIN is not a valid absolute URL");
  }
  if (parsed.protocol !== "https:") throw new Error("TIPULINKS_PUBLIC_ORIGIN must use https");
  if (parsed.username || parsed.password) throw new Error("TIPULINKS_PUBLIC_ORIGIN must not contain credentials");
  if (parsed.search || parsed.hash) throw new Error("TIPULINKS_PUBLIC_ORIGIN must not contain a query or fragment");
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error("TIPULINKS_PUBLIC_ORIGIN must not contain a path");
  }
  return parsed.origin;
}

/** Build an outgoing Twilio Voice callback URL from the trusted origin only. */
export function voiceCallbackUrl(path: string): string {
  return new URL(path, `${trustedVoiceOrigin()}/`).toString();
}

/**
 * Rebuild the exact URL Twilio signed: trusted origin + the incoming request's
 * pathname and raw query string (order and encoding preserved verbatim).
 */
export function signedWebhookUrl(request: Request): string {
  const incoming = new URL(request.url);
  return `${trustedVoiceOrigin()}${incoming.pathname}${incoming.search}`;
}


export type VerifiedWebhook =
  | { ok: true; params: Record<string, string>; url: string }
  | { ok: false; status: number };

/**
 * Full inbound-webhook gate: HTTPS, POST, valid signature over the exact URL
 * and the complete form payload, and the expected Account SID. Runs before any
 * database mutation. Returns a generic failure without leaking details.
 */
export async function verifyTwilioWebhook(request: Request): Promise<VerifiedWebhook> {
  if (request.method !== "POST") return { ok: false, status: 405 };

  let config: TwilioConfig;
  try {
    config = getTwilioConfig();
  } catch {
    console.error("[voice] webhook rejected: configuration incomplete");
    return { ok: false, status: 503 };
  }

  let url: string;
  try {
    url = signedWebhookUrl(request);
  } catch {
    console.error("[voice] webhook rejected: trusted origin unavailable");
    return { ok: false, status: 503 };
  }


  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return { ok: false, status: 415 };
  }

  const bodyText = await request.text();
  const params = parseTwilioForm(bodyText);

  const valid = validateTwilioSignature({
    authToken: config.authToken,
    url,
    params,
    signature: request.headers.get("x-twilio-signature"),
  });
  if (!valid) {
    console.error("[voice] webhook rejected: signature mismatch");
    return { ok: false, status: 403 };
  }

  if (params["AccountSid"] && params["AccountSid"] !== config.accountSid) {
    console.error("[voice] webhook rejected: unexpected account");
    return { ok: false, status: 403 };
  }

  return { ok: true, params, url };
}

/* -------------------------------------------------------------------------- */
/* TwiML                                                                       */
/* -------------------------------------------------------------------------- */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Bridge TwiML for a confirmed human visitor.
 *
 * - `answerOnBridge="true"` keeps the visitor hearing ringback until the
 *   therapist leg is answered.
 * - Caller ID for the therapist leg is the single Tipulinks number; the
 *   visitor's number is never used as caller ID.
 * - Exactly one server-fetched therapist number is dialed.
 * - No AMD, no `<Gather>`/"press 1" screening and no `<Conference>`: an
 *   answering machine, IVR or receptionist is a valid answer.
 * - Recording and transcription stay disabled.
 */
export function buildBridgeTwiml(input: {
  therapistPhone: string;
  callerId: string;
  therapistStatusCallbackUrl: string;
  dialActionUrl: string;
}): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    `<Dial answerOnBridge="true" callerId="${escapeXml(input.callerId)}" timeout="${DIAL_TIMEOUT_SECONDS}" timeLimit="${MAX_CALL_DURATION_SECONDS}" record="do-not-record" action="${escapeXml(input.dialActionUrl)}" method="POST">` +
    `<Number statusCallback="${escapeXml(input.therapistStatusCallbackUrl)}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${escapeXml(input.therapistPhone)}</Number>` +
    "</Dial>" +
    "</Response>"
  );
}

/** End the call without dialing anyone. */
export function buildHangupTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
}

export function twimlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
