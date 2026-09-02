import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");
const read = (...parts: string[]) => readFileSync(resolve(projectRoot, ...parts), "utf8");

const zoho = read("src/lib/zoho-mail.server.ts");
const adminFunctions = read("src/lib/admin-support.functions.ts");
const adminRoute = read("src/routes/admin/support.tsx");

describe("admin support deletion", () => {
  it("moves Zoho messages to Trash before deleting the local request", () => {
    expect(zoho).toContain("moveZohoSupportConversationToTrash");
    expect(zoho).toContain("expunge=false");
    expect(zoho).toContain('includesent: "true"');
    expect(adminFunctions).toContain("deleteAdminSupportRequest");
    expect(adminFunctions.indexOf("moveZohoSupportConversationToTrash")).toBeLessThan(
      adminFunctions.indexOf('.from("account_support_requests")\n      .delete()'),
    );
  });

  it("keeps deletion admin-only and requires explicit confirmation in the UI", () => {
    expect(adminFunctions).toContain('requireTipulinksAdmin(context.claims, "אין הרשאת מנהל למחיקת פניות לצוות.")');
    expect(adminRoute).toContain("מחיקת פנייה");
    expect(adminRoute).toContain("למחוק את הפנייה?");
    expect(adminRoute).toContain("AlertDialog");
  });
});
