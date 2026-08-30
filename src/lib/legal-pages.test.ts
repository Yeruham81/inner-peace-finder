import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..");
const readSource = (path: string) => readFileSync(join(SRC, path), "utf8");

describe("public legal pages", () => {
  it("links the privacy policy and terms of use from the public footer", () => {
    const root = readSource("routes/__root.tsx");
    expect(root).toContain('to="/privacy-policy"');
    expect(root).toContain("מדיניות פרטיות");
    expect(root).toContain('to="/terms-of-use"');
    expect(root).toContain("תנאי שימוש");
  });

  it("publishes dedicated canonical legal routes", () => {
    const privacy = readSource("routes/privacy-policy.tsx");
    const terms = readSource("routes/terms-of-use.tsx");

    expect(privacy).toContain('createFileRoute("/privacy-policy")');
    expect(privacy).toContain('absoluteUrl("/privacy-policy")');
    expect(privacy).toContain("מדיניות הפרטיות של טיפולינקס");

    expect(terms).toContain('createFileRoute("/terms-of-use")');
    expect(terms).toContain('absoluteUrl("/terms-of-use")');
    expect(terms).toContain("תנאי השימוש של טיפולינקס");
  });

  it("keeps the approved privacy and delivered-billing provisions in the web versions", () => {
    const privacy = readSource("routes/privacy-policy.tsx");
    const terms = readSource("routes/terms-of-use.tsx");

    expect(privacy).toContain("OpenAI");
    expect(privacy).toContain("משה ברק הוא בעל השליטה במאגר המידע");
    expect(terms).toContain("החיוב יתבצע רק כאשר הודעת הפנייה סומנה כנמסרה (Delivered)");
    expect(terms).toContain("1,000 ₪");
  });
});
