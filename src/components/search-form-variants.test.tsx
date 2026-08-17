import { afterAll, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// Bun module mocks are process-wide: replacing the whole router module would
// strip exports (e.g. `isRedirect`) that other test files' imports rely on.
// Keep every real export and override only the navigation hook.
const actualRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  useNavigate: () => () => undefined,
}));

afterAll(() => {
  mock.restore();
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
