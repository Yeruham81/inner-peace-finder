import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { looksLikeEmailAddress } from "./contact-validation";
import { looksLikeIsraeliPhone } from "./phone-il";

const SRC = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

describe("contact field validation", () => {
  it("accepts email-shaped addresses and rejects arbitrary text", () => {
    expect(looksLikeEmailAddress("therapist@example.com")).toBe(true);
    expect(looksLikeEmailAddress(" clinic+leads@sub.example.co.il ")).toBe(true);

    for (const value of [
      "",
      "not an email",
      "name@",
      "@example.com",
      "name @example.com",
      "name@example..com",
      ".name@example.com",
    ]) {
      expect(looksLikeEmailAddress(value), value).toBe(false);
    }
  });

  it("accepts Israeli phones with common typed and copied dash characters", () => {
    for (const value of ["052-2594893", "052‑2594893", "052–2594893", "052־2594893"]) {
      expect(looksLikeIsraeliPhone(value), value).toBe(true);
    }
  });

  it("shares the same checks between the profile UI and the server boundary", () => {
    const profileServer = read("lib/therapist-profile.functions.ts");
    const contactPanel = read("components/account/contact-preferences-panel.tsx");
    const adminEditor = read("routes/_authenticated/new-profile.tsx");

    expect(profileServer).toContain("OptionalContactEmailSchema");
    expect(profileServer).toContain("OptionalIsraeliPhoneSchema");
    expect(profileServer).toContain("looksLikeEmailAddress(value)");
    expect(profileServer).toContain("looksLikeIsraeliPhone(value)");
    expect(contactPanel).toContain("looksLikeEmailAddress(emailValue)");
    expect(contactPanel).toContain("looksLikeIsraeliPhone(phoneValue)");
    expect(adminEditor).toContain("looksLikeEmailAddress(adminEmailValue)");
  });

  it("uses the shared Israeli parser for the lead modal and lead server action", () => {
    const leadModal = read("components/lead-modal.tsx");
    const leadServer = read("lib/lead.functions.ts");

    expect(leadModal).toContain('placeholder="05X-XXXXXXX"');
    expect(leadModal).toContain("looksLikeIsraeliPhone(phone)");
    expect(leadServer).toContain("normalizeIsraeliPhone(data.visitorPhone)");
    expect(leadServer).toContain("_visitor_phone: visitorPhone.e164");
  });
});
