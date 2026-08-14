import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const componentSource = read("./public-route-error.tsx");
const routeSources = [
  read("../routes/search.tsx"),
  read("../routes/problems.$slug.tsx"),
  read("../routes/therapists.$slug.tsx"),
];

describe("public route error privacy", () => {
  it("never renders a raw error message on public routes", () => {
    for (const source of routeSources) {
      expect(source).not.toContain("error.message");
      expect(source).toContain("<PublicRouteError");
    }
  });

  it("reports the original error without rendering its content", () => {
    expect(componentSource).toContain("reportLovableError(error, { boundary })");
    expect(componentSource).not.toContain("error.message");
    expect(componentSource).not.toMatch(/\{error\}/);
  });

  it("offers safe retry and home actions", () => {
    expect(componentSource).toContain("router.invalidate()");
    expect(componentSource).toContain("reset()");
    expect(componentSource).toContain('to="/"');
    expect(componentSource).toContain("ניסיון נוסף");
  });
});
