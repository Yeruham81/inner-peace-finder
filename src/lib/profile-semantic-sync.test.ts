import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { computeSemanticProfile } from "./profile-semantic-sync";
import { parseStoredProfile } from "./therapist-semantic-profile";
import { PUBLIC_THERAPIST_COLUMNS, PRIVATE_THERAPIST_COLUMNS } from "./public-therapist-profile";
import { SemanticEngine } from "./semantic-engine";

/* ------------------------------------------------------------------ */
/* Fake catalog client (problems / problem_aliases / problem_intents)  */
/* ------------------------------------------------------------------ */

type Problem = { id: string; slug: string; name: string; is_active: boolean };

const PROBLEMS: Problem[] = [
  { id: "1", slug: "anxiety", name: "חרדה", is_active: true },
  { id: "2", slug: "depression", name: "דיכאון", is_active: true },
  { id: "3", slug: "legacy_inactive", name: "פוסט טראומה מורכבת", is_active: false },
];

function makeSb(opts: { failTable?: string } = {}) {
  const reads: string[] = [];
  const client = {
    reads,
    from(table: string) {
      reads.push(table);
      const rows =
        table === "problems"
          ? PROBLEMS.map((p) => ({ id: p.id, slug: p.slug, name: p.name, is_active: p.is_active }))
          : [];
      const builder: Record<string, unknown> = {};
      const result = () =>
        opts.failTable === table
          ? { data: null, error: { message: `read failed: ${table}` } }
          : { data: rows, error: null };
      let filtered = rows;
      const self = {
        select: () => self,
        eq: (column: string, value: unknown) => {
          filtered = filtered.filter((r) => (r as Record<string, unknown>)[column] === value);
          return self;
        },
        then: (resolve: (v: unknown) => unknown) => {
          const r = result();
          return Promise.resolve(r.error ? r : { data: filtered, error: null }).then(resolve);
        },
      };
      Object.assign(builder, self);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return self as any;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return client;
}

const RECOGNIZED = "אני מטפלת בחרדה ובהתקפי חרדה, ומלווה מטופלים בהתמודדות עם דיכאון לאורך זמן.";

describe("computeSemanticProfile", () => {
  it("returns canonical {slug, weight} entries for a recognized domain", async () => {
    const profile = await computeSemanticProfile(RECOGNIZED, makeSb());
    expect(profile.length).toBeGreaterThan(0);
    for (const entry of profile) {
      expect(typeof entry.slug).toBe("string");
      expect(typeof entry.weight).toBe("number");
      expect(Object.keys(entry).sort()).toEqual(["slug", "weight"]);
    }
    expect(profile.map((e) => e.slug)).toContain("anxiety");
  });

  it("stores only the canonical array structure (never a string array)", async () => {
    const profile = await computeSemanticProfile(RECOGNIZED, makeSb());
    expect(Array.isArray(profile)).toBe(true);
    expect(profile.some((e) => typeof e === "string")).toBe(false);
    // Round-trips through the search-side reader unchanged.
    expect(parseStoredProfile(profile)).toEqual(profile);
  });

  it("never stores inactive or unknown slugs", async () => {
    const profile = await computeSemanticProfile(
      "אני מטפלת בפוסט טראומה מורכבת וגם בחרדה חברתית ובחרדה כללית.",
      makeSb(),
    );
    expect(profile.map((e) => e.slug)).not.toContain("legacy_inactive");
    for (const entry of profile) {
      expect(["anxiety", "depression"]).toContain(entry.slug);
    }
  });

  it("clears the profile for an empty description", async () => {
    expect(await computeSemanticProfile("", makeSb())).toEqual([]);
    expect(await computeSemanticProfile(null, makeSb())).toEqual([]);
  });

  it("recognizes an explicit canonical domain without an arbitrary character minimum", async () => {
    expect((await computeSemanticProfile("חרדה", makeSb())).map((entry) => entry.slug)).toContain("anxiety");
  });

  it("returns [] (not an error) when nothing canonical is recognized", async () => {
    const profile = await computeSemanticProfile(
      "אני עובדת עם אנשים בגובה העיניים ומאמינה בקשר אנושי ארוך טווח בין אנשים.",
      makeSb(),
    );
    expect(profile).toEqual([]);
  });

  it("recomputes from the new description instead of appending to old matches", async () => {
    const first = await computeSemanticProfile(RECOGNIZED, makeSb());
    const second = await computeSemanticProfile(
      "אני מלווה מטופלים בהתמודדות עם דיכאון ודיכאון לאחר לידה במשך שנים רבות.",
      makeSb(),
    );
    expect(first.map((e) => e.slug)).toContain("anxiety");
    expect(second.map((e) => e.slug)).not.toContain("anxiety");
    expect(second.map((e) => e.slug)).toContain("depression");
  });

  it("propagates a catalog read failure instead of returning []", async () => {
    let threw = false;
    try {
      await computeSemanticProfile(RECOGNIZED, makeSb({ failTable: "problems" }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Save-flow wiring guards                                            */
/* ------------------------------------------------------------------ */

const saveSource = readFileSync("src/lib/therapist-profile.functions.ts", "utf8");

describe("saveMyProfile — semantic wiring", () => {
  it("computes the semantic profile inside the save handler", () => {
    expect(saveSource).toContain("computeSemanticProfile(data.full_description, supabase)");
  });

  it("computes it BEFORE any therapists write (create, draft, publish)", () => {
    const compute = saveSource.indexOf("await computeSemanticProfile(");
    const firstWrite = Math.min(
      ...[
        saveSource.indexOf('.from("therapists")\n      .update'),
        saveSource.indexOf('.from("therapists")\n        .insert'),
      ].filter((i) => i > 0),
    );
    expect(compute).toBeGreaterThan(0);
    expect(compute).toBeLessThan(firstWrite);
  });

  it("includes semantic_profile in the single transactional save payload", () => {
    expect(saveSource).toContain("semantic_profile: semanticProfile");
    const payloadStart = saveSource.indexOf("const payload = {");
    const payloadEnd = saveSource.indexOf('.rpc("save_therapist_profile_with_contacts"');
    expect(payloadStart).toBeGreaterThan(-1);
    expect(payloadEnd).toBeGreaterThan(payloadStart);
    expect(saveSource.slice(payloadStart, payloadEnd)).toContain("semantic_profile: semanticProfile");
    // Create and update share one atomic database operation.
    expect(saveSource).toContain("_payload: payload as never");
  });

  it("does not swallow extraction failures in the save flow", () => {
    const around = saveSource.slice(
      saveSource.indexOf("await computeSemanticProfile(") - 400,
      saveSource.indexOf("await computeSemanticProfile(") + 200,
    );
    expect(around).not.toContain("catch");
  });

  it("keeps authentication and ownership enforcement on the save flow", () => {
    expect(saveSource).toContain("requireSupabaseAuth");
    expect(saveSource).toContain('.eq("owner_account_id", accountId)');
  });

  it("adds no LLM dependency to the save flow", () => {
    expect(saveSource).not.toMatch(/llm/i);
  });

  it("does not touch therapist_problems (no mirror contract exists)", () => {
    expect(saveSource).not.toContain("therapist_problems");
  });

  it("uses the existing engine only — no second extraction implementation", () => {
    const syncSource = readFileSync("src/lib/profile-semantic-sync.ts", "utf8");
    expect(syncSource).toContain("SemanticEngine.extractProfile");
    expect(syncSource).toContain("serializeProfile");
    expect(syncSource).not.toMatch(/from ".\/llm-/);
    expect(typeof SemanticEngine.extractProfile).toBe("function");
  });
});

describe("Unified Search consumption", () => {
  it("scores a published therapist through the computed semantic profile", async () => {
    const profile = await computeSemanticProfile(RECOGNIZED, makeSb());
    const before = SemanticEngine.scoreProfiles([{ slug: "anxiety", confidence: 1 }], []);
    const after = SemanticEngine.scoreProfiles([{ slug: "anxiety", confidence: 1 }], profile);
    expect(before).toBe(0);
    expect(after).toBeGreaterThan(0);
  });
});

describe("public DTO", () => {
  it("still hides semantic_profile", () => {
    expect(PUBLIC_THERAPIST_COLUMNS as readonly string[]).not.toContain("semantic_profile");
    expect(PRIVATE_THERAPIST_COLUMNS as readonly string[]).toContain("semantic_profile");
  });
});
