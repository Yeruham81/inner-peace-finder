import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  useNavigate: () => () => undefined,
}));

const { SearchForm } = await import("./search-form");

describe("SearchForm variants", () => {
  it("renders only the query input and submit button in simple mode", () => {
    const html = renderToStaticMarkup(<SearchForm variant="simple" />);

    expect(html).toContain('type="search"');
    expect(html).toContain("חיפוש מטפלים");
    expect(html).not.toContain("מסננים מהירים");
    expect(html).not.toContain("מסננים נוספים");
  });

  it("keeps the quick and additional filters in compact mode", () => {
    const html = renderToStaticMarkup(<SearchForm variant="compact" />);

    expect(html).toContain("מסננים מהירים");
    expect(html).toContain("מסננים נוספים");
  });

  it("uses simple mode only for the lower homepage search", () => {
    const homepageSource = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    const searchPageSource = readFileSync(new URL("../routes/search.tsx", import.meta.url), "utf8");

    expect(homepageSource.match(/<SearchForm variant="simple" \/>/g)).toHaveLength(1);
    expect(homepageSource).toMatch(
      /<SearchForm\s+cities=\{filters\.cities\}\s+populations=\{filters\.populations\}\s+languages=\{filters\.languages\}\s*\/>/,
    );
    expect(searchPageSource).toContain('variant="compact"');
  });
});
