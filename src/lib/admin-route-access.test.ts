import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");
const adminRoute = readFileSync(resolve(projectRoot, "src/routes/admin/route.tsx"), "utf8");

describe("admin route access", () => {
  it("blocks the entire admin route tree unless the authenticated user is an admin", () => {
    expect(adminRoute).toContain('import { supabase } from "@/integrations/supabase/client"');
    expect(adminRoute).toContain("supabase.auth.getUser()");
    expect(adminRoute).toContain('user.app_metadata?.tipulinks_role !== "admin"');
    expect(adminRoute).toContain('throw redirect({ to: "/" })');
    expect(adminRoute).toContain("ssr: false");
  });

  it("does not send non-admin users into the normal sign-in flow", () => {
    expect(adminRoute).not.toContain('to: "/auth"');
  });
});
