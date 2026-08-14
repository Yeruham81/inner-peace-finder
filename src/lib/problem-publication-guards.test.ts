import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./therapists.functions.ts", import.meta.url), "utf8");

const listProblemsSource = source.slice(
  source.indexOf("export const listProblems"),
  source.indexOf("export const listFilterOptions"),
);

const getProblemBySlugSource = source.slice(
  source.indexOf("export const getProblemBySlug"),
  source.indexOf("export const getTherapistBySlug"),
);

describe("public problem publication guards", () => {
  it("lists only active problems", () => {
    expect(listProblemsSource).toContain('.eq("is_active", true)');
  });

  it("never resolves an inactive problem slug", () => {
    const activeGuards = getProblemBySlugSource.match(/\.eq\("is_active", true\)/g) ?? [];
    expect(activeGuards).toHaveLength(2);
  });

  it("returns only active children", () => {
    const childrenQuery = getProblemBySlugSource.slice(
      getProblemBySlugSource.indexOf("data: children"),
      getProblemBySlugSource.indexOf("if (childrenError)"),
    );
    expect(childrenQuery).toContain('.eq("is_active", true)');
  });

  it("propagates parent and child query errors instead of hiding them", () => {
    expect(getProblemBySlugSource).toContain(
      "if (problemError) throw new Error(problemError.message)",
    );
    expect(getProblemBySlugSource).toContain(
      "if (childrenError) throw new Error(childrenError.message)",
    );
  });
});
