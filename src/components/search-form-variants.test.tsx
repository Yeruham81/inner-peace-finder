import { afterAll, describe, expect, it, spyOn } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import * as ReactRouter from "@tanstack/react-router";

// Do not use mock.module() here: Bun module mocks are process-wide and are not
// undone by mock.restore(). Spy only on the hook this test needs so every other
// router export remains real and the spy can be restored after this file.
const useNavigateSpy = spyOn(ReactRouter, "useNavigate").mockReturnValue(
  (() => undefined) as ReturnType<typeof ReactRouter.useNavigate>,
);

afterAll(() => {
  useNavigateSpy.mockRestore();
});

const { SearchForm } = await import("./search-form");

describe("SearchForm variants", () => {
  it("renders only the query input and submit button in simple mode", () => {
    const html = renderToStaticMarkup(<SearchForm variant="simple" />);

    expect(html).toContain('type="search"');
    expect(html).toContain("חיפוש מטפלים");
    expect(html).not.toContain("מסננים מהירים");
    expect(html).not.toContain("מסננים נוספים");
  });

  it("keeps the additional filters in compact mode", () => {
    const html = renderToStaticMarkup(<SearchForm variant="compact" />);

    expect(html).toContain("מסננים נוספים");
  });

  it("shows query-inferred criteria before the compact filters and syncs population display", () => {
    const html = renderToStaticMarkup(
      <SearchForm
        variant="compact"
        populations={[{ slug: "adolescents", name: "בני נוער" }]}
        inferredCriteria={[
          { type: "problem", value: "social_anxiety", label: "חרדה חברתית" },
          { type: "population", value: "adolescents", label: "בני נוער" },
        ]}
      />,
    );

    expect(html).toContain("לפי החיפוש:");
    expect(html).toContain("חרדה חברתית");
    expect(html).toContain('aria-label="הסרת הקריטריון בני נוער"');
    expect(html).toContain("אוכלוסיית יעד");
    expect(html).toContain("בני נוער");
  });

  it("uses simple mode only for the lower homepage search", () => {
    const homepageSource = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    const searchPageSource = readFileSync(new URL("../routes/search.tsx", import.meta.url), "utf8");

    expect(homepageSource.match(/<SearchForm variant="simple" \/>/g)).toHaveLength(1);
    expect(homepageSource).toMatch(
      /<SearchForm\s+cities=\{filters\.cities\}\s+cityRegions=\{filters\.cityRegions\}\s+populations=\{filters\.populations\}\s+languages=\{filters\.languages\}\s*\/>/,
    );
    expect(searchPageSource).toContain('variant="compact"');
  });
});
