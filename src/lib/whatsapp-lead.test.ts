import { describe, expect, it, beforeEach, afterEach } from "bun:test";

import {
  WHATSAPP_LEAD_STATUS_PATH,
  renderWhatsAppLeadBody,
  whatsappContentVariables,
  whatsappDirectChatUrl,
  whatsappSender,
} from "./whatsapp-lead.server";
import { voiceCallbackUrl } from "./twilio-voice.server";

const ORIGINAL_ORIGIN = process.env["TIPULINKS_PUBLIC_ORIGIN"];
const ORIGINAL_FROM = process.env["TWILIO_WHATSAPP_FROM"];

beforeEach(() => {
  process.env["TIPULINKS_PUBLIC_ORIGIN"] = "https://tipulinks.co.il";
});

afterEach(() => {
  if (ORIGINAL_ORIGIN === undefined) delete process.env["TIPULINKS_PUBLIC_ORIGIN"];
  else process.env["TIPULINKS_PUBLIC_ORIGIN"] = ORIGINAL_ORIGIN;
  if (ORIGINAL_FROM === undefined) delete process.env["TWILIO_WHATSAPP_FROM"];
  else process.env["TWILIO_WHATSAPP_FROM"] = ORIGINAL_FROM;
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

  it("includes the visitor's callback details and message", () => {
    const body = renderWhatsAppLeadBody(payload);
    expect(body).toContain("יוסי לוי");
    expect(body).toContain("+972501234567");
    expect(body).toContain("אשמח לתאם פגישה");
  });

  it("maps template variables in a stable order", () => {
    expect(JSON.parse(whatsappContentVariables(payload))).toEqual({
      "1": "יוסי לוי",
      "2": "+972501234567",
      "3": "אשמח לתאם פגישה",
      "4": "https://wa.me/972501234567",
    });
  });

  it("builds the direct WhatsApp link from E.164 without the leading plus", () => {
    expect(whatsappDirectChatUrl("+972501234567")).toBe("https://wa.me/972501234567");
  });
});
