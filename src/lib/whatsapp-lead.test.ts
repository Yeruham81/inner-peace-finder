import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import {
  WHATSAPP_LEAD_STATUS_PATH,
  sendWhatsAppLead,
  whatsappContentSid,
  whatsappContentVariables,
  whatsappDirectChatUrl,
  whatsappLeadStatusCallbackUrl,
  whatsappSender,
  sanitizeWhatsAppTemplateVariable,
} from "./whatsapp-lead.server";
import { voiceCallbackUrl } from "./twilio-voice.server";
import { WHATSAPP_LEAD_MESSAGE_MAX_LENGTH } from "./whatsapp-lead.shared";

const ORIGINAL_ORIGIN = process.env["TIPULINKS_PUBLIC_ORIGIN"];
const ORIGINAL_FROM = process.env["TWILIO_WHATSAPP_FROM"];
const ORIGINAL_CONTENT_SID = process.env["TIPULINKS_WHATSAPP_LEAD_CONTENT_SID"];

beforeEach(() => {
  process.env["TIPULINKS_PUBLIC_ORIGIN"] = "https://tipulinks.co.il";
});

afterEach(() => {
  if (ORIGINAL_ORIGIN === undefined) delete process.env["TIPULINKS_PUBLIC_ORIGIN"];
  else process.env["TIPULINKS_PUBLIC_ORIGIN"] = ORIGINAL_ORIGIN;
  if (ORIGINAL_FROM === undefined) delete process.env["TWILIO_WHATSAPP_FROM"];
  else process.env["TWILIO_WHATSAPP_FROM"] = ORIGINAL_FROM;
  if (ORIGINAL_CONTENT_SID === undefined) delete process.env["TIPULINKS_WHATSAPP_LEAD_CONTENT_SID"];
  else process.env["TIPULINKS_WHATSAPP_LEAD_CONTENT_SID"] = ORIGINAL_CONTENT_SID;
});

describe("whatsapp lead status callback URL", () => {
  it("is built only from the trusted public origin", () => {
    expect(voiceCallbackUrl(WHATSAPP_LEAD_STATUS_PATH)).toBe("https://tipulinks.co.il/api/public/whatsapp/lead-status");
  });

  it("cannot be built from a spoofed host header value", () => {
    process.env["TIPULINKS_PUBLIC_ORIGIN"] = "https://attacker.example";
    expect(voiceCallbackUrl(WHATSAPP_LEAD_STATUS_PATH)).not.toContain("tipulinks.co.il");
    process.env["TIPULINKS_PUBLIC_ORIGIN"] = "https://tipulinks.co.il";
    expect(voiceCallbackUrl(WHATSAPP_LEAD_STATUS_PATH)).toContain("tipulinks.co.il");
  });

  it("includes the pre-created delivery id as a signed correlation query parameter", () => {
    const deliveryId = "11111111-1111-4111-8111-111111111111";
    expect(whatsappLeadStatusCallbackUrl(deliveryId)).toBe(
      `https://tipulinks.co.il/api/public/whatsapp/lead-status?delivery_id=${deliveryId}`,
    );
  });
});

describe("whatsapp sender", () => {
  it("returns null when no sender is configured", () => {
    delete process.env["TWILIO_WHATSAPP_FROM"];
    expect(whatsappSender()).toBeNull();
  });

  it("normalizes the sender to the whatsapp channel prefix", () => {
    process.env["TWILIO_WHATSAPP_FROM"] = "+14155238886";
    expect(whatsappSender()).toBe("whatsapp:+14155238886");
    process.env["TWILIO_WHATSAPP_FROM"] = "whatsapp:+14155238886";
    expect(whatsappSender()).toBe("whatsapp:+14155238886");
  });
});

describe("message rendering", () => {
  const payload = {
    visitorName: "יוסי לוי",
    visitorPhone: "+972501234567",
    message: "אשמח לתאם פגישה",
  };

  it("maps template variables in a stable order", () => {
    expect(JSON.parse(whatsappContentVariables(payload))).toEqual({
      "1": "יוסי לוי",
      "2": "+972501234567",
      "3": "אשמח לתאם פגישה",
      "4": "https://wa.me/972501234567",
    });
  });

  it("normalizes Twilio template variables without stripping legitimate punctuation or emoji", () => {
    expect(sanitizeWhatsAppTemplateVariable("  שלום,\n\tאשמח  לדבר 🙂\u0000  ")).toBe("שלום, אשמח לדבר 🙂");

    const variables = JSON.parse(
      whatsappContentVariables({
        visitorName: "  יוסי\nלוי  ",
        visitorPhone: "+972501234567",
        message: "שלום!\nאשמח לתאם פגישה. 🙂",
      }),
    );
    expect(variables["1"]).toBe("יוסי לוי");
    expect(variables["3"]).toBe("שלום! אשמח לתאם פגישה. 🙂");
  });

  it("builds the direct WhatsApp link from E.164 without the leading plus", () => {
    expect(whatsappDirectChatUrl("+972501234567")).toBe("https://wa.me/972501234567");
  });
});

describe("WhatsApp approved template requirement", () => {
  const payload = {
    visitorName: "יוסי לוי",
    visitorPhone: "+972501234567",
    message: "אשמח לתאם פגישה",
  };

  it("fails closed before Twilio when the approved Content SID is missing", async () => {
    process.env["TWILIO_WHATSAPP_FROM"] = "+97233828222";
    delete process.env["TIPULINKS_WHATSAPP_LEAD_CONTENT_SID"];

    expect(whatsappContentSid()).toBeNull();
    expect(
      await sendWhatsAppLead({
        destinationE164: "+972501111111",
        deliveryId: "11111111-1111-4111-8111-111111111111",
        payload,
      }),
    ).toEqual({ ok: false, code: "whatsapp_template_not_configured" });
  });

  it("reads the approved Content SID from the server environment", () => {
    process.env["TIPULINKS_WHATSAPP_LEAD_CONTENT_SID"] = "HXtest-approved-template";
    expect(whatsappContentSid()).toBe("HXtest-approved-template");
  });

  it("contains no plain Body fallback in the WhatsApp sender", () => {
    const serverSource = readFileSync(join(import.meta.dir, "whatsapp-lead.server.ts"), "utf8");
    expect(serverSource).not.toContain('params.set("Body"');
    expect(serverSource).not.toContain("renderWhatsAppLeadBody");
    expect(serverSource).toContain("whatsapp_template_not_configured");
  });
});

describe("WhatsApp visitor-facing delivery privacy", () => {
  const modalSource = readFileSync(join(import.meta.dir, "../components/whatsapp-lead-modal.tsx"), "utf8");

  it("shows the same success state for internal availability and delivery failures", () => {
    expect(modalSource).toContain('res.reason === "therapist_unavailable" || res.reason === "delivery_failed"');
    expect(modalSource).toContain("setDone(true)");
  });

  it("keeps actionable visitor validation and anti-abuse failures visible", () => {
    expect(modalSource).toContain('res.reason === "rate_limit_exceeded"');
    expect(modalSource).toContain('res.reason === "challenge_failed" || res.reason === "challenge_expired"');
    expect(modalSource).toContain("setError(res.message)");
  });

  it("shows the agreed WhatsApp success heading and explanatory follow-up", () => {
    expect(modalSource).toContain("הפנייה נשלחה למטפל");
    expect(modalSource).toContain("הפנייה נשלחה למטפל דרך WhatsApp. אם תתקבל תשובה, היא תופיע ישירות ב-WhatsApp שלך.");
    expect(modalSource).not.toContain("ההודעה נשלחה ל{therapistName} ב־WhatsApp");
  });
});

describe("WhatsApp lead submit button", () => {
  const modalSource = readFileSync(join(import.meta.dir, "../components/whatsapp-lead-modal.tsx"), "utf8");

  it("uses the agreed WhatsApp-specific Hebrew action label", () => {
    expect(modalSource).toContain('"שלח הודעה בווטסאפ"');
    expect(modalSource).not.toContain('"שליחת ההודעה"');
  });

  it("renders a WhatsApp icon together with the submit label", () => {
    expect(modalSource).toContain("function WhatsAppIcon");
    expect(modalSource).toContain('<WhatsAppIcon className="h-5 w-5 shrink-0" />');
  });
});

describe("WhatsApp lead message length", () => {
  const modalSource = readFileSync(join(import.meta.dir, "../components/whatsapp-lead-modal.tsx"), "utf8");
  const functionSource = readFileSync(join(import.meta.dir, "whatsapp-lead.functions.ts"), "utf8");

  it("uses the same 1000-character cap in both the UI and server validation", () => {
    expect(WHATSAPP_LEAD_MESSAGE_MAX_LENGTH).toBe(1000);
    expect(modalSource).toContain("maxLength={WHATSAPP_LEAD_MESSAGE_MAX_LENGTH}");
    expect(functionSource).toContain(".max(WHATSAPP_LEAD_MESSAGE_MAX_LENGTH)");
  });
});

describe("WhatsApp Twilio authentication", () => {
  const serverSource = readFileSync(join(import.meta.dir, "whatsapp-lead.server.ts"), "utf8");

  it("keeps WhatsApp on Account SID + Auth Token rather than the Voice API key", () => {
    expect(serverSource).toContain("`${config.accountSid}:${config.authToken}`");
    expect(serverSource).not.toContain("`${config.apiKeySid}:${config.apiKeySecret}`");
  });
});
