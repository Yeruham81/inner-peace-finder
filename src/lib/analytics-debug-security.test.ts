import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");
const rootRoute = readFileSync(resolve(projectRoot, "src/routes/__root.tsx"), "utf8");

describe("analytics debug endpoint security", () => {
  it("does not expose the analytics debug server function", () => {
    expect(existsSync(resolve(projectRoot, "src/lib/analytics-debug.functions.ts"))).toBe(false);
  });

  it("does not ship or globally mount the analytics debug panel", () => {
    expect(existsSync(resolve(projectRoot, "src/components/analytics-debug-panel.tsx"))).toBe(
      false,
    );
    expect(rootRoute).not.toContain("AnalyticsDebugPanel");
    expect(rootRoute).not.toContain("analytics-debug-panel");
  });
});
