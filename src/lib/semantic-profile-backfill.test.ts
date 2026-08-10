import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  BACKFILL_CONFIRM_TOKEN,
  isLegacyStringProfile,
  runSemanticProfileBackfill,
} from "./semantic-profile-backfill";
import type { SemanticProfileEntry } from "./therapist-semantic-profile";

type Row = {
  id: string;
  slug: string;
  full_name: string;
  profile_status: string;
  full_description: string | null;
  semantic_profile: unknown;
};

type UpdateCall = { payload: Record<string, unknown>; filters: unknown[] };

function makeSb(rows: Row[], opts: { concurrent?: Set<string> } = {}) {
  const updates: UpdateCall[] = [];
  const sb = {
    updates,
    from(_table: string) {
      const api: Record<string, unknown> = {};
      let payload: Record<string, unknown> | null = null;
      const filters: unknown[] = [];
      const self = {
        select: (_c?: string) => self,
        update: (p: Record<string, unknown>) => {
          payload = p;
          return self;
        },
        eq: (c: string, v: unknown) => {
          filters.push([c, v]);
          return self;
        },
        is: (c: string, v: unknown) => {
          filters.push([c, v]);
          return self;
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (payload) {
            updates.push({ payload, filters });
            const idFilter = filters.find(
              (f) => Array.isArray(f) && f[0] === "id",
            ) as [string, string];
            const blocked = opts.concurrent?.has(idFilter[1]);
            return Promise.resolve({
              data: blocked ? [] : [{ id: idFilter[1] }],
              error: null,
            }).then(resolve);
          }
          return Promise.resolve({
            data: rows.filter((r) => r.profile_status === "published"),
            error: null,
          }).then(resolve);
        },
      };
      Object.assign(api, self);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return self as any;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return sb;
}

const legacy: Row = {
  id: "t1",
  slug: "dana",
  full_name: "דנה",
  profile_status: "published",
  full_description: "תיאור מקצועי",
  semantic_profile: ["anxiety", "depression"],
};

const okCompute = async (): Promise<SemanticProfileEntry[]> => [
  { slug: "anxiety", weight: 0.8 },
];

describe("isLegacyStringProfile", () => {
  it("accepts a non-empty string array", () => {
    expect(isLegacyStringProfile(["anxiety"])).toBe(true);
  });
  it("rejects canonical, empty, null, object, mixed and malformed values", () => {
    expect(isLegacyStringProfile([{ slug: "anxiety", weight: 1 }])).toBe(false);
    expect(isLegacyStringProfile([])).toBe(false);
    expect(isLegacyStringProfile(null)).toBe(false);
    expect(isLegacyStringProfile({ domains: ["anxiety"] })).toBe(false);
    expect(isLegacyStringProfile(["anxiety", { slug: "x", weight: 1 }])).toBe(false);
    expect(isLegacyStringProfile("anxiety")).toBe(false);
    expect(isLegacyStringProfile([1, 2])).toBe(false);
  });
});

describe("dry run (default)", () => {
  it("is the default mode and performs zero update calls", async () => {
    const sb = makeSb([legacy]);
    const summary = await runSemanticProfileBackfill(sb, { compute: okCompute });
    expect(summary.mode).toBe("dry-run");
    expect(summary.writesPerformed).toBe(0);
    expect(sb.updates.length).toBe(0);
    expect(summary.rows[0]?.outcome).toBe("dry_run_ok");
    expect(summary.rows[0]?.next).toEqual([{ slug: "anxiety", weight: 0.8 }]);
  });

  it("only treats published legacy rows as candidates", async () => {
    const sb = makeSb([
      legacy,
      { ...legacy, id: "t2", profile_status: "draft" },
      { ...legacy, id: "t3", semantic_profile: [{ slug: "anxiety", weight: 1 }] },
      { ...legacy, id: "t4", semantic_profile: [] },
      { ...legacy, id: "t5", semantic_profile: null },
      { ...legacy, id: "t6", semantic_profile: { domains: [] } },
    ]);
    const summary = await runSemanticProfileBackfill(sb, { compute: okCompute });
    expect(summary.legacyCandidates).toBe(1);
    expect(summary.scanned).toBe(5);
    expect(summary.skippedNonLegacy).toBe(4);
  });

  it("keeps a legitimate empty computation as []", async () => {
    const sb = makeSb([legacy]);
    const summary = await runSemanticProfileBackfill(sb, { compute: async () => [] });
    expect(summary.rows[0]?.next).toEqual([]);
    expect(summary.rows[0]?.outcome).toBe("dry_run_ok");
    expect(summary.errors).toBe(0);
  });

  it("reports catalog/extraction errors without converting them to []", async () => {
    const sb = makeSb([legacy]);
    const summary = await runSemanticProfileBackfill(sb, {
      compute: async () => {
        throw new Error("read failed: problems");
      },
    });
    expect(summary.errors).toBe(1);
    expect(summary.computed).toBe(0);
    expect(summary.rows[0]?.outcome).toBe("error");
    expect(summary.rows[0]?.next).toBe(null);
    expect(summary.rows[0]?.errorCategory).toBe("extraction_or_catalog");
  });
});

describe("apply guards", () => {
  it("blocks apply without the confirmation token", async () => {
    const sb = makeSb([legacy]);
    await expect(
      runSemanticProfileBackfill(sb, { apply: true, expectedCount: 1, compute: okCompute }),
    ).rejects.toThrow(/confirmation token/);
    expect(sb.updates.length).toBe(0);
  });

  it("blocks apply without a reviewed expected count", async () => {
    const sb = makeSb([legacy]);
    await expect(
      runSemanticProfileBackfill(sb, {
        apply: true,
        confirmToken: BACKFILL_CONFIRM_TOKEN,
        compute: okCompute,
      }),
    ).rejects.toThrow(/expected count/);
    expect(sb.updates.length).toBe(0);
  });

  it("aborts on candidate-count drift before any write", async () => {
    const sb = makeSb([legacy]);
    await expect(
      runSemanticProfileBackfill(sb, {
        apply: true,
        confirmToken: BACKFILL_CONFIRM_TOKEN,
        expectedCount: 12,
        compute: okCompute,
      }),
    ).rejects.toThrow(/drift/);
    expect(sb.updates.length).toBe(0);
  });
});

describe("apply writes", () => {
  const applyOpts = {
    apply: true as const,
    confirmToken: BACKFILL_CONFIRM_TOKEN,
    expectedCount: 1,
    compute: okCompute,
  };

  it("writes only semantic_profile, guarded by the originally read values", async () => {
    const sb = makeSb([legacy]);
    const summary = await runSemanticProfileBackfill(sb, applyOpts);
    expect(summary.updated).toBe(1);
    const call = sb.updates[0] as UpdateCall;
    expect(Object.keys(call.payload)).toEqual(["semantic_profile"]);
    expect(call.payload["semantic_profile"]).toEqual([{ slug: "anxiety", weight: 0.8 }]);
    expect(call.filters).toEqual([
      ["id", "t1"],
      ["profile_status", "published"],
      ["semantic_profile", '["anxiety","depression"]'],
      ["full_description", "תיאור מקצועי"],
    ]);
  });

  it("skips concurrent changes without retrying", async () => {
    const sb = makeSb([legacy], { concurrent: new Set(["t1"]) });
    const summary = await runSemanticProfileBackfill(sb, applyOpts);
    expect(summary.skippedConcurrentChange).toBe(1);
    expect(summary.updated).toBe(0);
    expect(sb.updates.length).toBe(1);
  });

  it("is idempotent: a canonical row is non-legacy on the next run", async () => {
    const canonical: Row = { ...legacy, semantic_profile: [{ slug: "anxiety", weight: 0.8 }] };
    const sb = makeSb([canonical]);
    const summary = await runSemanticProfileBackfill(sb, {
      apply: true,
      confirmToken: BACKFILL_CONFIRM_TOKEN,
      expectedCount: 0,
      compute: okCompute,
    });
    expect(summary.legacyCandidates).toBe(0);
    expect(summary.updated).toBe(0);
    expect(sb.updates.length).toBe(0);
  });
});

describe("architecture guards", () => {
  const core = readFileSync("src/lib/semantic-profile-backfill.ts", "utf8");
  const cli = readFileSync("scripts/semantic-profile-backfill.ts", "utf8");

  it("delegates computation to computeSemanticProfile only", () => {
    expect(core).toContain('from "./profile-semantic-sync"');
    expect(core).toContain("options.compute ?? computeSemanticProfile");
    expect(core).not.toContain("extractProfile(");
  });

  it("adds no route, endpoint, UI, migration or LLM", () => {
    expect(core).not.toMatch(/createServerFn|createFileRoute|tsx?\bReact/);
    expect(cli).not.toMatch(/createServerFn|createFileRoute/);
    expect(cli).not.toMatch(/openai|anthropic|gateway/i);
  });

  it("never falls back to the publishable key", () => {
    expect(cli).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(cli).not.toContain("PUBLISHABLE");
  });
});