import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import {
  DEFAULT_SEARCH_RETURN,
  buildResultsReturn,
  resultsReturnLinkOptions,
  sanitizeResultsReturn,
} from "./search-return";

const modal = readFileSync("src/components/lead-modal.tsx", "utf8");
const card = readFileSync("src/components/therapist-card.tsx", "utf8");
const profileRoute = readFileSync("src/routes/therapists.$slug.tsx", "utf8");
const problemRoute = readFileSync("src/routes/problems.$slug.tsx", "utf8");
const unifiedSearchFunctions = readFileSync("src/lib/query-interpreter.functions.ts", "utf8");

describe("back-to-search button", () => {
  it("restores the exact filtered results state, including sort and page", () => {
    const ret = "/search?q=%D7%96%D7%95%D7%92&problem=couples_conflict&sort=rank&page=3&online=true";
    const opts = resultsReturnLinkOptions(ret);
    expect(opts.to).toBe("/search");
    if (opts.to !== "/search") throw new Error("expected search return options");
    expect(opts.search).toEqual({
      q: "זוג",
      problem: "couples_conflict",
      sort: "rank",
      page: 3,
      online: true,
    });
  });

  it("falls back to the default results page for a directly opened or refreshed profile", () => {
    expect(resultsReturnLinkOptions("")).toEqual({ to: "/search", search: {} });
    expect(resultsReturnLinkOptions(undefined)).toEqual({ to: "/search", search: {} });
    expect(DEFAULT_SEARCH_RETURN).toBe("/search");
  });

  it("keeps backwards-compatible ret parsing while new profile links stay clean", () => {
    expect(profileRoute).toContain("ret: z.string().optional()");
    const opts = resultsReturnLinkOptions("/search?q=abc");
    if (opts.to !== "/search") throw new Error("expected search return options");
    expect(opts.search).toEqual({ q: "abc" });
  });

  it("returns to the exact canonical problem results page", () => {
    expect(resultsReturnLinkOptions("/problems/couples_conflict")).toEqual({
      to: "/problems/$slug",
      params: { slug: "couples_conflict" },
    });
  });

  it("rejects external and invalid return destinations", () => {
    for (const bad of ["https://evil.test/search", "//evil.test/search", "/account", 42, null]) {
      expect(resultsReturnLinkOptions(bad as unknown)).toEqual({ to: "/search", search: {} });
    }
  });

  it("never routes the visible button to the homepage", () => {
    const page = profileRoute.slice(profileRoute.indexOf("function TherapistPage"));
    expect(page).toContain("resultsReturnLinkOptions(ret || rememberedReturn)");
    expect(page).toContain("readRememberedResultsReturn()");
    expect(page).toContain('backToResults.to === "/problems/$slug"');
    expect(page).toContain('to="/problems/$slug"');
    expect(page).toContain('to="/search"');
    expect(page).not.toContain('to="/"');
  });
});

describe("buildResultsReturn", () => {
  it("preserves the full search-results URL (query, filters, sort, state)", () => {
    const qs = "?q=%D7%96%D7%95%D7%92&problem=couples_conflict&city=&sort=rank&page=2";
    expect(buildResultsReturn("/search", qs)).toBe(`/search${qs}`);
  });

  it("returns the bare results path when there is no query string", () => {
    expect(buildResultsReturn("/search", "")).toBe("/search");
  });

  it("preserves a canonical problem page and drops unrelated query parameters", () => {
    expect(buildResultsReturn("/problems/anxiety", "?utm_source=test")).toBe("/problems/anxiety");
  });

  it("returns undefined outside the allowlisted results routes", () => {
    expect(buildResultsReturn("/therapists/dana-levi", "?x=1")).toBeUndefined();
    expect(buildResultsReturn("/problems/anxiety/more", "")).toBeUndefined();
    expect(buildResultsReturn("/", "")).toBeUndefined();
  });
});

describe("sanitizeResultsReturn", () => {
  it("accepts internal search-results paths and keeps parameters", () => {
    expect(sanitizeResultsReturn("/search?q=abc&city=%D7%AA%D7%9C+%D7%90%D7%91%D7%99%D7%91")).toBe(
      "/search?q=abc&city=%D7%AA%D7%9C+%D7%90%D7%91%D7%99%D7%91",
    );
    expect(sanitizeResultsReturn("/search")).toBe("/search");
  });

  it("accepts only canonical problem result paths without query parameters", () => {
    expect(sanitizeResultsReturn("/problems/anxiety")).toBe("/problems/anxiety");
    expect(sanitizeResultsReturn("/problems/couples_conflict")).toBe("/problems/couples_conflict");
  });

  it("falls back to the default results page for a directly opened profile", () => {
    expect(sanitizeResultsReturn(undefined)).toBe(DEFAULT_SEARCH_RETURN);
    expect(sanitizeResultsReturn("")).toBe(DEFAULT_SEARCH_RETURN);
    expect(DEFAULT_SEARCH_RETURN).toBe("/search");
  });

  it("rejects external and invalid destinations", () => {
    for (const bad of [
      "https://evil.test/search",
      "//evil.test/search",
      "http://localhost/search",
      "javascript:alert(1)",
      "/search\\@evil.test",
      "/account",
      "/therapists/dana-levi",
      "/problems/anxiety?next=//evil.test",
      "/problems/anxiety/more",
      "/problems/../account",
      "/problems/%2Faccount",
      "search?q=1",
      42,
      null,
    ]) {
      expect(sanitizeResultsReturn(bad as unknown)).toBe(DEFAULT_SEARCH_RETURN);
    }
  });
});

describe("canonical problem-page search", () => {
  it("uses the unified card pipeline without the legacy adapter", () => {
    expect(problemRoute).toContain("searchProblemResults");
    expect(problemRoute).toContain("pipeline.results");
    expect(problemRoute).toContain('pageSource="problem"');
    expect(problemRoute).not.toContain("searchTherapists");
    expect(problemRoute).not.toContain("legacyRowToCard");
  });

  it("validates an active canonical slug and injects it without free-text classification", () => {
    const problemSearch = unifiedSearchFunctions.slice(
      unifiedSearchFunctions.indexOf("export async function runUnifiedProblemSearch"),
      unifiedSearchFunctions.indexOf("export const interpretQueryFn"),
    );
    expect(problemSearch).toContain('.from("problems")');
    expect(problemSearch).toContain('.eq("is_active", true)');
    expect(problemSearch).toContain("buildProblemSearchPlan");
    expect(problemSearch).toContain("executeUnifiedPlan");
    expect(problemSearch).not.toContain("SemanticEngine.classify");
    expect(unifiedSearchFunctions).toContain("semanticSignals: [{ slug: problem.slug, confidence: 1 }]");
  });
});

describe("contact-flow wiring", () => {
  it("returns only after confirmed success is explicitly closed, once, with replace navigation", () => {
    expect(modal).toContain("if (redirectedRef.current) return;");
    expect(modal).toContain("redirectedRef.current = true;");
    expect(modal).toContain("navigate({ href: returnTo, replace: true })");
    // done is only set after the server confirms ok
    expect(modal).toContain("setDone(true);");
    const failurePaths = modal.slice(modal.indexOf("if (!res.ok)"), modal.indexOf("setDone(true);"));
    expect(failurePaths).not.toContain("navigate(");
  });

  it("resets the form state as part of the redirect", () => {
    const redirect = modal.slice(modal.indexOf("const returnToResults"), modal.indexOf("const handleCloseRequest"));
    expect(redirect).toContain("setDone(false);");
    expect(redirect).toContain('setName("");');
    expect(redirect).toContain("setMessage(defaultMessage(problemName, populationName));");
    expect(redirect).toContain("onClose();");
  });

  it("keeps the final success confirmation visible until explicit close", () => {
    expect(modal).toContain("הפנייה נשלחה בהצלחה. ניתן להמשיך לעיין בתוצאות החיפוש ולשלוח פניות נוספות.");
    expect(modal).toContain("סגירה וחזרה לתוצאות");
    expect(modal).not.toContain("LEAD_SUCCESS_REDIRECT_MS");
    expect(modal).not.toContain("setTimeout(returnToResults");
  });

  it("blocks every dialog-close path while the submission is in progress", () => {
    const closeHandler = modal.slice(
      modal.indexOf("const handleCloseRequest"),
      modal.indexOf("// Reset state on every open"),
    );
    expect(closeHandler).toContain("if (submitting) return;");
    expect(modal).toContain("onClick={handleCloseRequest}");
    expect(modal).toContain('if (e.key === "Escape") handleCloseRequest();');
    expect(modal).toContain("{!submitting && !done && (");
  });

  it("turns a close attempt after success into the same return navigation", () => {
    const closeHandler = modal.slice(
      modal.indexOf("const handleCloseRequest"),
      modal.indexOf("// Reset state on every open"),
    );
    expect(closeHandler).toContain("if (done) {");
    expect(closeHandler).toContain("returnToResults();");
    const successUi = modal.slice(modal.indexOf("{done ? ("), modal.indexOf(") : (", modal.indexOf("{done ? (")));
    expect(successUi).toContain("סגירה וחזרה לתוצאות");
    expect(successUi).toContain("onClick={returnToResults}");
  });

  it("does not schedule automatic navigation after success", () => {
    expect(modal).not.toContain("setTimeout(returnToResults");
    expect(modal).not.toContain("LEAD_SUCCESS_REDIRECT_MS");
  });

  it("keeps therapist URLs clean and stores the return destination outside the URL", () => {
    expect(card).toContain("buildResultsReturn(s.location.pathname, s.location.searchStr)");
    expect(card).toContain("rememberResultsReturn(returnTo)");
    expect(card).toContain("search={{}}");
    expect(card).not.toContain("search={returnTo ? { ret: returnTo } : {}}");
    expect(profileRoute).toContain("readRememberedResultsReturn()");
    expect(profileRoute).toContain("ret: z.string().optional()");
  });

  it("does not rely on history.back()", () => {
    expect(modal).not.toContain("history.back");
  });
});
