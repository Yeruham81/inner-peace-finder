import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { DEFAULT_SEARCH_RETURN, buildSearchReturn, sanitizeSearchReturn } from "./search-return";

const modal = readFileSync("src/components/lead-modal.tsx", "utf8");
const card = readFileSync("src/components/therapist-card.tsx", "utf8");
const profileRoute = readFileSync("src/routes/therapists.$slug.tsx", "utf8");

describe("buildSearchReturn", () => {
  it("preserves the full search-results URL (query, filters, sort, state)", () => {
    const qs = "?q=%D7%96%D7%95%D7%92&problem=couples_conflict&city=&sort=rank&page=2";
    expect(buildSearchReturn("/search", qs)).toBe(`/search${qs}`);
  });

  it("returns the bare results path when there is no query string", () => {
    expect(buildSearchReturn("/search", "")).toBe("/search");
  });

  it("returns undefined outside the search-results route", () => {
    expect(buildSearchReturn("/therapists/dana-levi", "?x=1")).toBeUndefined();
    expect(buildSearchReturn("/", "")).toBeUndefined();
  });
});

describe("sanitizeSearchReturn", () => {
  it("accepts internal search-results paths and keeps parameters", () => {
    expect(sanitizeSearchReturn("/search?q=abc&city=%D7%AA%D7%9C+%D7%90%D7%91%D7%99%D7%91")).toBe(
      "/search?q=abc&city=%D7%AA%D7%9C+%D7%90%D7%91%D7%99%D7%91",
    );
    expect(sanitizeSearchReturn("/search")).toBe("/search");
  });

  it("falls back to the default results page for a directly opened profile", () => {
    expect(sanitizeSearchReturn(undefined)).toBe(DEFAULT_SEARCH_RETURN);
    expect(sanitizeSearchReturn("")).toBe(DEFAULT_SEARCH_RETURN);
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
      "search?q=1",
      42,
      null,
    ]) {
      expect(sanitizeSearchReturn(bad as unknown)).toBe(DEFAULT_SEARCH_RETURN);
    }
  });
});

describe("contact-flow wiring", () => {
  it("redirects only after a confirmed success, once, with replace navigation", () => {
    expect(modal).toContain("if (!open || !done || redirectedRef.current) return;");
    expect(modal).toContain("redirectedRef.current = true;");
    expect(modal).toContain("navigate({ href: returnTo, replace: true })");
    // done is only set after the server confirms ok
    expect(modal).toContain("setDone(true);");
    const failurePaths = modal.slice(modal.indexOf("if (!res.ok)"), modal.indexOf("setDone(true);"));
    expect(failurePaths).not.toContain("navigate(");
  });

  it("resets the form state as part of the redirect", () => {
    const effect = modal.slice(modal.indexOf("redirectedRef.current = true;"));
    expect(effect).toContain("setDone(false);");
    expect(effect).toContain("setName(\"\");");
    expect(effect).toContain("onClose();");
  });

  it("shows the success confirmation copy before redirecting", () => {
    expect(modal).toContain("הפנייה נשלחה בהצלחה. ניתן להמשיך לעיין בתוצאות החיפוש ולשלוח פניות נוספות.");
    expect(modal).toContain("LEAD_SUCCESS_REDIRECT_MS");
  });

  it("passes the return destination from result cards to the profile route", () => {
    expect(card).toContain("buildSearchReturn(s.location.pathname, s.location.searchStr)");
    expect(card).toContain("search={returnTo ? { ret: returnTo } : {}}");
    expect(profileRoute).toContain("ret: fallback(z.string(), \"\").default(\"\")");
  });

  it("does not rely on history.back()", () => {
    expect(modal).not.toContain("history.back");
  });
});
