import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(import.meta.dir, "../routes/admin/catalogs.tsx"), "utf8");
const functions = readFileSync(join(import.meta.dir, "admin-catalogs.functions.ts"), "utf8");

describe("admin catalogs read-only integration", () => {
  test("loads the admin catalog screen from the real server function instead of mock data", () => {
    expect(route).toContain("listAdminCatalogs");
    expect(route).not.toContain("MOCK_CATALOGS");
    expect(route).not.toContain("toggleItem");
    expect(route).toContain("מצב צפייה בלבד");
  });

  test("reads the canonical database catalog tables", () => {
    expect(functions).toContain('.from("professions")');
    expect(functions).toContain('.from("problems")');
    expect(functions).toContain('.from("population_groups")');
    expect(functions).toContain('.from("treatment_modalities")');
    expect(functions).toContain('.from("languages")');
  });

  test("reads canonical product regions and exposes no mutation server function", () => {
    expect(functions).toContain("REGION_SLUGS");
    expect(functions).toContain("REGION_DEFINITIONS");
    expect(functions).not.toContain('method: "POST"');
    expect(functions).not.toContain(".insert(");
    expect(functions).not.toContain(".update(");
    expect(functions).not.toContain(".delete(");
  });
});
