import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(import.meta.dir, file), "utf8");

describe("profile contact layout guards", () => {
  it("keeps the sticky contact card below the site header", () => {
    const source = read("therapist-profile-view.tsx");
    expect(source).toContain("lg:sticky");
    expect(source).toContain("lg:top-24");
    expect(source).toContain("lg:self-start");
  });

  it("portals the lead dialog above sticky page stacking contexts", () => {
    const source = read("lead-modal.tsx");
    expect(source).toContain('import { createPortal } from "react-dom"');
    expect(source).toContain("z-[100]");
    expect(source).toContain("document.body");
  });

  it("does not promise that therapist contact details stay hidden", () => {
    const source = read("lead-modal.tsx");
    expect(source).not.toContain("מספר המטפל/ת אינו נחשף");
    expect(source).not.toContain("הפנייה נשלחת דרך טיפולינקס");
  });
});
