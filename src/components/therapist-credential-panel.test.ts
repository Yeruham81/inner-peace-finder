import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  aggregateCredentialStatus,
  buildCredentialObjectPath,
  isEditableCredentialStatus,
  isOwnedCredentialDocumentPath,
  validateCredentialUpload,
} from "@/lib/credential-workflow";

const panelSource = readFileSync(join(import.meta.dir, "therapist-credential-panel.tsx"), "utf8");
const serverSource = readFileSync(join(import.meta.dir, "..", "lib", "therapist-profile.functions.ts"), "utf8");
const editorSource = readFileSync(join(import.meta.dir, "..", "routes", "_authenticated", "new-profile.tsx"), "utf8");

const UID = "11111111-2222-3333-4444-555555555555";
const OTHER_UID = "99999999-2222-3333-4444-555555555555";

describe("credential data contract", () => {
  it("exposes credentials as an array and no singular credential field", () => {
    expect(serverSource).toContain("export type CredentialEditorData");
    expect(serverSource).toContain("credentials: CredentialEditorData[]");
    expect(serverSource).not.toMatch(/^\s{2}credential:\s/m);
    expect(serverSource).not.toContain("@ts-ignore");
    expect(serverSource).not.toContain("@ts-expect-error");
  });

  it("loads every credential without limit(1) and propagates query errors", () => {
    expect(serverSource).not.toContain(".limit(1)");
    expect(serverSource).toContain('.order("updated_at", { ascending: false })');
    expect(serverSource).toContain("if (credentials.error) throw new Error(credentials.error.message)");
    expect(serverSource).toContain("credentials: (credentials.data ?? [])");
  });

  it("passes the credentials prop from the profile editor", () => {
    expect(editorSource).toContain("credentials={profile.data?.credentials ?? []}");
    expect(editorSource).not.toContain("credential={");
  });
});

describe("credential submission security", () => {
  it("verifies ownership, blocks verified rows and forces pending_review", () => {
    expect(serverSource).toContain('.eq("therapist_id", profile.id)');
    expect(serverSource).toContain("רשומת ההסמכה אינה שייכת לפרופיל.");
    expect(serverSource).toContain("לא ניתן לשנות הסמכה שכבר אומתה.");
    expect(serverSource).toContain('verification_status: "pending_review" as const');
    expect(serverSource).toContain("submitted_at: new Date().toISOString()");
    expect(serverSource).toContain("rejection_reason: null");
    expect(serverSource).toContain("verified_by: null");
    expect(serverSource).toContain("verified_at: null");
  });

  it("never accepts verification fields from client input", () => {
    const schema = serverSource.slice(
      serverSource.indexOf("const CredentialSubmissionSchema"),
      serverSource.indexOf("export const submitMyCredential"),
    );
    for (const field of ["verification_status", "verified_by", "verified_at", "rejection_reason", "therapist_id"]) {
      expect(schema).not.toContain(field);
    }
  });

  it("performs the controlled write through the server-only admin client", () => {
    expect(serverSource).toContain('await import("@/integrations/supabase/client.server")');
    expect(panelSource).not.toContain("client.server");
    expect(panelSource).not.toContain("SERVICE_ROLE");
    expect(panelSource).not.toContain("supabaseAdmin");
  });

  it("rejects foreign or malformed document paths server-side", () => {
    expect(isOwnedCredentialDocumentPath(`${UID}/${crypto.randomUUID()}.pdf`, UID)).toBe(true);
    expect(isOwnedCredentialDocumentPath(`${OTHER_UID}/${crypto.randomUUID()}.pdf`, UID)).toBe(false);
    expect(isOwnedCredentialDocumentPath(`${UID}/../${OTHER_UID}/a.pdf`, UID)).toBe(false);
    expect(isOwnedCredentialDocumentPath(`${UID}/sub/a.pdf`, UID)).toBe(false);
    expect(isOwnedCredentialDocumentPath(`${UID}/evil.exe`, UID)).toBe(false);
    expect(isOwnedCredentialDocumentPath("", UID)).toBe(false);
    expect(serverSource).toContain("isOwnedCredentialDocumentPath(data.document_url, context.userId)");
  });
});

describe("private document upload", () => {
  it("builds paths from auth.uid() and a generated uuid, not therapistId", () => {
    const path = buildCredentialObjectPath(UID, "abcdef01-2222-3333-4444-555555555555", "pdf");
    expect(path.startsWith(`${UID}/`)).toBe(true);
    expect(panelSource).toContain("supabase.auth.getUser()");
    expect(panelSource).toContain("crypto.randomUUID()");
    expect(panelSource).toContain("buildCredentialObjectPath(auth.user.id");
    expect(panelSource).not.toContain("${therapistId}/");
    expect(panelSource).toContain('const BUCKET = "therapist-credentials"');
    expect(panelSource).not.toContain("getPublicUrl");
  });

  it("rejects invalid mime types and files over 10MB", () => {
    expect(validateCredentialUpload({ type: "application/pdf", size: 1000 }).ok).toBe(true);
    expect(validateCredentialUpload({ type: "image/gif", size: 1000 }).ok).toBe(false);
    expect(validateCredentialUpload({ type: "image/png", size: 10 * 1024 * 1024 + 1 }).ok).toBe(false);
  });
});

describe("multiple-credential interface", () => {
  it("renders every credential with its details and status", () => {
    expect(panelSource).toContain("credentials.map((credential)");
    expect(panelSource).toContain("credential.credential_type");
    expect(panelSource).toContain("professionName.get(credential.profession_id)");
    expect(panelSource).toContain("credential.issuing_authority");
    expect(panelSource).toContain("credential.license_number");
    expect(panelSource).toContain("credential.rejection_reason");
  });

  it("keeps verified credentials read-only and allows editing the rest", () => {
    expect(panelSource).toContain("הסמכה מאומתת — לא ניתן לעריכה.");
    expect(panelSource).toContain("עריכה ושליחה מחדש");
    expect(isEditableCredentialStatus("verified")).toBe(false);
    expect(isEditableCredentialStatus("expired")).toBe(false);
    expect(isEditableCredentialStatus("rejected")).toBe(true);
    expect(isEditableCredentialStatus("pending_review")).toBe(true);
    expect(isEditableCredentialStatus("unverified")).toBe(true);
  });

  it("always allows adding another credential", () => {
    expect(panelSource).toContain("הוספת הסמכה נוספת");
    expect(panelSource).toContain("credential_id: credential?.id ?? null");
  });

  it("awaits my-profile invalidation after a successful submission", () => {
    expect(panelSource).toContain('await queryClient.invalidateQueries({ queryKey: ["my-profile"] })');
  });

  it("adds no approval or rejection controls", () => {
    expect(panelSource).not.toContain("אישור הסמכה");
    expect(panelSource).not.toContain("verification_status:");
  });

  it("uses the aggregate status precedence for the section", () => {
    expect(aggregateCredentialStatus([{ verification_status: "rejected" }, { verification_status: "verified" }])).toBe(
      "verified",
    );
    expect(
      aggregateCredentialStatus([{ verification_status: "rejected" }, { verification_status: "pending_review" }]),
    ).toBe("pending_review");
    expect(aggregateCredentialStatus([{ verification_status: "expired" }, { verification_status: "rejected" }])).toBe(
      "rejected",
    );
    expect(aggregateCredentialStatus([{ verification_status: "unverified" }, { verification_status: "expired" }])).toBe(
      "expired",
    );
    expect(aggregateCredentialStatus([])).toBe("unverified");
  });

  it("preserves the RTL Hebrew copy and its place under education and training", () => {
    expect(panelSource).toContain("אימות ההכשרה או ההסמכה");
    expect(panelSource).toMatch(/לא\s+יוצגו בגלוי בפרופיל\s+הציבורי/);
    expect(panelSource).toContain("תאריך קבלת ההסמכה או כניסתה לתוקף");
    expect(panelSource).not.toContain("תאריך תפוגה");
    const educationIndex = editorSource.indexOf('title="השכלה והכשרה"');
    const panelIndex = editorSource.indexOf("<TherapistCredentialPanel");
    expect(educationIndex).toBeGreaterThan(-1);
    expect(panelIndex).toBeGreaterThan(educationIndex);
  });
});
