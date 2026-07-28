import { describe, expect, it } from "bun:test";
import { parseStoredProfile, serializeProfile } from "./therapist-semantic-profile";

describe("parseStoredProfile", () => {
  it("parses a canonical array of {slug, weight}", () => {
    const raw = [
      { slug: "anxiety", weight: 0.8 },
      { slug: "trauma", weight: 0.5 },
    ];
    const out = parseStoredProfile(raw);
    expect(out).toEqual([
      { slug: "anxiety", weight: 0.8 },
      { slug: "trauma", weight: 0.5 },
    ]);
  });

  it("preserves slugs exactly", () => {
    const out = parseStoredProfile([{ slug: "adhd", weight: 1 }]);
    expect(out[0].slug).toBe("adhd");
  });

  it("preserves weights exactly", () => {
    const out = parseStoredProfile([{ slug: "anxiety", weight: 0.42 }]);
    expect(out[0].weight).toBe(0.42);
  });

  it("returns [] for null", () => {
    expect(parseStoredProfile(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(parseStoredProfile(undefined)).toEqual([]);
  });

  it("returns [] for malformed non-array", () => {
    expect(parseStoredProfile({ domains: ["anxiety"] })).toEqual([]);
    expect(parseStoredProfile("anxiety")).toEqual([]);
    expect(parseStoredProfile(123)).toEqual([]);
  });

  it("skips malformed items but keeps valid ones", () => {
    const out = parseStoredProfile([
      { slug: "anxiety", weight: 0.8 },
      { slug: "" },
      null,
      { weight: 0.5 },
      "trauma",
    ]);
    expect(out).toEqual([
      { slug: "anxiety", weight: 0.8 },
      { slug: "trauma", weight: 1 },
    ]);
  });

  it("does NOT read the legacy { domains: [...] } shape", () => {
    // The unified executor MUST NOT rely on the previous incompatible shape.
    // parseStoredProfile only accepts arrays.
    expect(parseStoredProfile({ domains: [{ slug: "anxiety", weight: 1 }] })).toEqual([]);
  });

  it("serializeProfile roundtrips canonical entries", () => {
    const entries = [{ slug: "anxiety", weight: 0.8 }];
    expect(serializeProfile(entries)).toEqual(entries);
  });
});