import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_CONTACT_CHANNEL_AVAILABILITY,
  filterAvailableContactMethods,
  resolveAvailablePreferredContactMethod,
} from "./contact-channel-settings";

function read(...parts: string[]): string {
  return readFileSync(join(import.meta.dir, "..", ...parts), "utf8");
}

const migration = read("..", "supabase", "migrations", "20260827060000_contact_channel_availability.sql");
const adminRoute = read("routes", "admin", "settings.tsx");
const accountPanel = read("components", "account", "contact-preferences-panel.tsx");
const therapistFunctions = read("lib", "therapists.functions.ts");
const whatsappFunctions = read("lib", "whatsapp-lead.functions.ts");
const voiceFunctions = read("lib", "voice-call.functions.ts");
const leadFunctions = read("lib", "lead.functions.ts");

describe("global contact channel availability", () => {
  it("launches with email enabled and WhatsApp/phone disabled", () => {
    expect(DEFAULT_CONTACT_CHANNEL_AVAILABILITY).toEqual({
      email: true,
      whatsapp: false,
      phone: false,
    });
    expect(migration).toContain("email_enabled boolean not null default true");
    expect(migration).toContain("whatsapp_enabled boolean not null default false");
    expect(migration).toContain("phone_enabled boolean not null default false");
  });

  it("filters public methods without mutating the therapist's stored preferences", () => {
    const stored = ["whatsapp", "email", "phone"] as const;
    const available = filterAvailableContactMethods(stored, {
      email: true,
      whatsapp: false,
      phone: false,
    });

    expect(available).toEqual(["email"]);
    expect(stored).toEqual(["whatsapp", "email", "phone"]);
    expect(resolveAvailablePreferredContactMethod(available, "whatsapp")).toBe("email");
  });

  it("wires the admin switches to persisted server settings", () => {
    expect(adminRoute).toContain("getAdminContactChannelAvailability");
    expect(adminRoute).toContain("updateAdminContactChannelAvailability");
    expect(adminRoute).toContain("כיבוי ערוץ מסיר מיד את הלחצן שלו גם מפרופילים קיימים");
  });

  it("keeps disabled channels visible to therapists as unavailable", () => {
    expect(accountPanel).toContain("getContactChannelAvailability");
    expect(accountPanel).toContain('!available ? "זמנית לא פעיל"');
    expect(accountPanel).toContain("disabled={!available || mutation.isPending}");
    expect(accountPanel).toContain("יישאר שמור אך לא יהיה זמין לקבלת פניות");
  });

  it("filters the public profile and enforces every channel server-side", () => {
    expect(therapistFunctions).toContain("filterAvailableContactMethods");
    expect(therapistFunctions).toContain("resolveAvailablePreferredContactMethod");
    expect(whatsappFunctions).toContain('isContactChannelEnabled("whatsapp")');
    expect(voiceFunctions).toContain('isContactChannelEnabled("phone")');
    expect(leadFunctions).toContain('isContactChannelEnabled("email")');
  });
});
