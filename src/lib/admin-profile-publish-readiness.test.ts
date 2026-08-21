import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const editorSource = readFileSync(
  join(import.meta.dir, "..", "routes", "_authenticated", "new-profile.tsx"),
  "utf8",
);
const profileFunctions = readFileSync(join(import.meta.dir, "therapist-profile.functions.ts"), "utf8");

describe("admin-created profile publish readiness", () => {
  it("requires a professional email in the admin editor before publish", () => {
    expect(editorSource).toContain('isAdmin && !form.email.trim() ? ["אימייל מקצועי"] : []');
    expect(editorSource).toContain('<Field label="אימייל מקצועי *">');
    expect(editorSource).toContain("זהו שדה חובה לפרסום");
  });

  it("keeps the live readiness badge aligned with the publish button", () => {
    expect(editorSource).toContain('const displayStatus: "draft" | "completed" | "published"');
    expect(editorSource).toContain('status === "published" ? "published" : publishMissing ? "draft" : "completed"');
    expect(editorSource).toContain("<StatusBadge status={displayStatus} />");
    expect(editorSource).toContain("disabled={pendingAction !== null || publishMissing}");
  });

  it("enforces the professional email again at the server boundary for admin-public profiles", () => {
    expect(profileFunctions).toContain(
      'function validateForPublish(input: SaveInput, saveMode: "self" | "admin_public_info" = "self")',
    );
    expect(profileFunctions).toContain('saveMode === "admin_public_info" && !input.email?.trim()');
    expect(profileFunctions).toContain('missing.push("אימייל מקצועי")');
    expect(profileFunctions).toContain("validateForPublish(data, saveMode)");
  });
});
