import { describe, expect, it } from "bun:test";
import { resolveFlow } from "@/routes/search";

describe("resolveFlow — production forces unified, DEV honors the URL param", () => {
  it("production + flow=legacy → unified", () => {
    expect(resolveFlow("legacy", { isDev: false })).toBe("unified");
  });
  it("production + no param → unified", () => {
    expect(resolveFlow("", { isDev: false })).toBe("unified");
  });
  it("production + flow=unified → unified", () => {
    expect(resolveFlow("unified", { isDev: false })).toBe("unified");
  });
  it("production + garbage param → unified (never legacy fallback)", () => {
    expect(resolveFlow("something-else", { isDev: false })).toBe("unified");
  });
  it("DEV + flow=legacy → legacy", () => {
    expect(resolveFlow("legacy", { isDev: true })).toBe("legacy");
  });
  it("DEV + flow=unified → unified", () => {
    expect(resolveFlow("unified", { isDev: true })).toBe("unified");
  });
  it("DEV + invalid param → unified default", () => {
    expect(resolveFlow("bogus", { isDev: true })).toBe("unified");
  });
});
