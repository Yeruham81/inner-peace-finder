import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_THERAPIST_REGISTRATION_AVAILABILITY,
  THERAPIST_REGISTRATION_CLOSED_MESSAGE,
} from "./therapist-registration-settings";

function read(...parts: string[]): string {
  return readFileSync(join(import.meta.dir, "..", ...parts), "utf8");
}

const migration = read(
  "..",
  "supabase",
  "migrations",
  "20260831010000_therapist_registration_control.sql",
);
const adminRoute = read("routes", "admin", "settings.tsx");
const authRoute = read("routes", "auth.tsx");
const forTherapistsRoute = read("routes", "for-therapists.tsx");
const accountFunctions = read("lib", "therapist-accounts.functions.ts");
const profileFunctions = read("lib", "therapist-profile.functions.ts");
const claimFunctions = read("lib", "profile-claim-v2.functions.ts");

describe("therapist registration control", () => {
  it("launches fail-closed with new therapist registration disabled", () => {
    expect(DEFAULT_THERAPIST_REGISTRATION_AVAILABILITY).toEqual({ enabled: false });
    expect(migration).toContain("registration_enabled boolean not null default false");
    expect(migration).toContain("values (true, false)");
  });

  it("persists an admin-only registration switch", () => {
    expect(adminRoute).toContain("getAdminTherapistRegistrationAvailability");
    expect(adminRoute).toContain("updateAdminTherapistRegistrationAvailability");
    expect(adminRoute).toContain("אפשר הרשמת מטפלים חדשים");
  });

  it("blocks signup UI and self-service account creation while closed", () => {
    expect(authRoute).toContain("getTherapistRegistrationAvailability");
    expect(authRoute).toContain("THERAPIST_REGISTRATION_CLOSED_MESSAGE");
    expect(forTherapistsRoute).toContain("ההרשמה למטפלים חדשים אינה זמינה כרגע");
    expect(accountFunctions).toContain("assertTherapistRegistrationEnabled");
    expect(profileFunctions).toContain("assertTherapistRegistrationEnabled");
    expect(claimFunctions).toContain("assertTherapistRegistrationEnabled");
  });

  it("enforces the gate at the therapist_accounts RLS boundary", () => {
    expect(migration).toContain('drop policy if exists "Account owner can insert self"');
    expect(migration).toContain("public.is_therapist_registration_enabled()");
    expect(migration).toContain("auth_user_id = auth.uid()");
    expect(THERAPIST_REGISTRATION_CLOSED_MESSAGE).toContain("אינה זמינה כרגע");
  });
});
