/**
 * Regression guard for the application-level public-eligibility invariant:
 * every public therapist read routes through the shared predicate in
 * `search-eligibility.ts`, and the public profile response carries only
 * allowlisted columns.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeSupabase, type FakeRow } from "./test-support/fake-supabase";
import {
  fetchPublicTherapistBySlug,
  listEligibleFilterOptions,
  listEligibleTherapistSlugs,
} from "./public-therapist-queries";
import {
  PRIVATE_THERAPIST_COLUMNS,
  PUBLIC_THERAPIST_COLUMNS,
  PUBLIC_THERAPIST_SELECT,
} from "./public-therapist-profile";
import { isEligibleRow } from "./search-eligibility";

const LIB = import.meta.dir;
const SRC = join(LIB, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Base row containing BOTH public and private columns, as the table does. */
function therapistRow(over: FakeRow): FakeRow {
  return {
    id: "t-1",
    slug: "eligible-one",
    full_name: "פלונית",
    professional_title: "פסיכולוגית",
    short_intro: "מבוא",
    full_description: "תיאור",
    education_training: "תואר שני והכשרה קלינית",
    professional_experience: "שמונה שנות ניסיון",
    years_experience: 8,
    city: "חיפה",
    image_url: null,
    verified: true,
    is_active: true,
    profile_status: "published",
    visibility: "published",
    email: "private@example.test",
    phone: "0500000000",
    owner_account_id: "acct-1",
    semantic_profile: [{ slug: "anxiety", weight: 1 }],
    bio_raw: "staging",
    license_number: "L-1",
    contact_destination: "private@example.test",
    ...over,
  };
}

const INELIGIBLE_STATES: Array<[string, FakeRow]> = [
  ["draft", { profile_status: "draft" }],
  ["completed but unpublished", { profile_status: "completed" }],
  ["inactive", { is_active: false }],
  ["hidden", { visibility: "hidden" }],
  ["hidden_by_owner", { visibility: "hidden_by_owner" }],
  ["archived", { visibility: "archived" }],
];

function db(rows: FakeRow[], overrides: Record<string, FakeRow[]> = {}) {
  return createFakeSupabase({
    therapists: rows,
    therapist_problems: [
      {
        therapist_id: "t-1",
        problems: { id: "p1", name: "חרדה", slug: "anxiety", parent_id: null },
      },
    ],
    therapist_populations: [{ therapist_id: "t-1", population_groups: { slug: "adults", name: "מבוגרים" } }],
    therapist_languages: [{ therapist_id: "t-1", languages: { code: "he", name: "עברית" } }],
    therapist_professions: [
      {
        therapist_id: "t-1",
        is_primary: true,
        professions: { slug: "psychologist", name: "פסיכולוגית", sort_order: 1, is_active: true },
      },
    ],
    therapist_modalities: [
      {
        therapist_id: "t-1",
        treatment_modalities: { slug: "cbt", name: "CBT", sort_order: 1, is_active: true },
      },
    ],
    therapist_therapy_formats: [{ therapist_id: "t-1", therapy_formats: { slug: "individual", name: "טיפול פרטני" } }],
    therapist_locations: [
      {
        therapist_id: "t-1",
        location_type: "clinic",
        city: "חיפה",
        region: "חיפה והקריות",
        is_primary: true,
        is_active: true,
        accessibility_status: "accessible",
        accessibility_features: ["step_free_entrance"],
        accessibility_note: null,
      },
      {
        therapist_id: "t-1",
        location_type: "online",
        city: null,
        region: null,
        is_primary: false,
        is_active: true,
        accessibility_status: "unknown",
        accessibility_features: [],
        accessibility_note: null,
      },
    ],
    therapist_professional_memberships: [
      { therapist_id: "t-1", organization_name: "איגוד מקצועי", member_since: 2020, sort_order: 0 },
    ],
    therapist_service_arrangements: [
      { therapist_id: "t-1", organization_name: "גוף מסדיר", note: "בכפוף לזכאות", sort_order: 0 },
    ],
    therapist_credentials: [],
    population_groups: [{ slug: "adults", name: "מבוגרים" }],
    languages: [{ code: "he", name: "עברית" }],
    ...overrides,
  });
}

describe("public eligibility — shared predicate", () => {
  it("the shared row predicate rejects every ineligible state", () => {
    expect(isEligibleRow(therapistRow({}) as never)).toBe(true);
    for (const [, over] of INELIGIBLE_STATES) {
      expect(isEligibleRow(therapistRow(over) as never)).toBe(false);
    }
    expect(isEligibleRow(therapistRow({ visibility: "visible" }) as never)).toBe(true);
  });

  it("getTherapistBySlug's query returns null for every ineligible state", async () => {
    for (const [label, over] of INELIGIBLE_STATES) {
      const res = await fetchPublicTherapistBySlug(db([therapistRow(over)]), "eligible-one");
      expect(res, label).toBeNull();
    }
  });

  it("an eligible published profile still loads normally", async () => {
    const res = await fetchPublicTherapistBySlug(db([therapistRow({})]), "eligible-one");
    expect(res?.full_name).toBe("פלונית");
    expect(res?.problems.map((p) => p.slug)).toEqual(["anxiety"]);
    expect(res?.populations.map((p) => p.slug)).toEqual(["adults"]);
    expect(res?.languages.map((l) => l.code)).toEqual(["he"]);
    expect(res?.education_training).toBe("תואר שני והכשרה קלינית");
    expect(res?.professional_experience).toBe("שמונה שנות ניסיון");
    expect(res?.professions.map((item) => item.slug)).toEqual(["psychologist"]);
    expect(res?.modalities.map((item) => item.slug)).toEqual(["cbt"]);
    expect(res?.locations.map((item) => item.location_type)).toEqual(["clinic", "online"]);
  });

  it("grants the public verified badge when a credential was verified", async () => {
    const res = await fetchPublicTherapistBySlug(
      db([therapistRow({ verified: false })], {
        therapist_credentials: [{ therapist_id: "t-1", id: "credential-1", verification_status: "verified" }],
      }),
      "eligible-one",
    );
    expect(res?.verified).toBe(true);
  });

  it("the public profile response contains every field the route consumes", async () => {
    const res = await fetchPublicTherapistBySlug(db([therapistRow({})]), "eligible-one");
    for (const col of PUBLIC_THERAPIST_COLUMNS) {
      expect(Object.keys(res as object)).toContain(col);
    }
    for (const rel of [
      "problems",
      "populations",
      "languages",
      "professions",
      "modalities",
      "therapy_formats",
      "locations",
      "professional_memberships",
      "service_arrangements",
    ]) {
      expect(Object.keys(res as object)).toContain(rel);
    }
  });

  it("the public profile response contains no private or internal column", async () => {
    const res = (await fetchPublicTherapistBySlug(db([therapistRow({})]), "eligible-one")) as Record<string, unknown>;
    const keys = Object.keys(res);
    for (const col of PRIVATE_THERAPIST_COLUMNS) {
      expect(keys, col).not.toContain(col);
    }
    // Explicit, named assertions for the highest-risk fields.
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("owner_account_id");
    expect(keys).not.toContain("semantic_profile");
    expect(keys).not.toContain("bio_raw");
    expect(JSON.stringify(res)).not.toContain("private@example.test");
    expect(JSON.stringify(res)).not.toContain("0500000000");
  });

  it("listAllTherapistSlugs emits only eligible slugs", async () => {
    const rows = [
      therapistRow({}),
      ...INELIGIBLE_STATES.map(([label, over], i) =>
        therapistRow({ ...over, id: `x-${i}`, slug: `bad-${label.replace(/\s/g, "-")}` }),
      ),
    ];
    expect(await listEligibleTherapistSlugs(db(rows))).toEqual(["eligible-one"]);
  });

  it("listFilterOptions derives cities from every active clinic of eligible profiles", async () => {
    const rows = [
      therapistRow({ city: "עיר ישנה שלא נמצאת במיקומים" }),
      therapistRow({ id: "x-1", slug: "draft-1", profile_status: "draft", city: "אילת" }),
      therapistRow({ id: "x-2", slug: "hidden-1", visibility: "hidden", city: "צפת" }),
    ];
    const opts = await listEligibleFilterOptions(
      db(rows, {
        therapist_locations: [
          { therapist_id: "t-1", location_type: "clinic", city: "חיפה", is_active: true },
          { therapist_id: "t-1", location_type: "clinic", city: " עכו ", is_active: true },
          { therapist_id: "t-1", location_type: "clinic", city: "אילת", is_active: false },
          { therapist_id: "t-1", location_type: "online", city: "ירושלים", is_active: true },
          { therapist_id: "x-1", location_type: "clinic", city: "אילת", is_active: true },
          { therapist_id: "x-2", location_type: "clinic", city: "צפת", is_active: true },
        ],
      }),
    );
    expect(opts.cities).toEqual(["חיפה", "עכו"]);
    expect(opts.cities).not.toContain("עיר ישנה שלא נמצאת במיקומים");
    expect(opts.cities).not.toContain("אילת");
    expect(opts.cities).not.toContain("צפת");
    expect(opts.cities).not.toContain("ירושלים");
  });
});

describe("public eligibility — centralization", () => {
  const PUBLIC_QUERY_FILES = [
    "lib/therapists.functions.ts",
    "lib/structured-search.functions.ts",
    "lib/query-interpreter.functions.ts",
    "lib/public-therapist-queries.ts",
  ];

  it("no public query file hard-codes the eligibility values inline", () => {
    for (const f of PUBLIC_QUERY_FILES) {
      const src = read(f);
      expect(src.includes('"profile_status", "published"'), f).toBe(false);
      expect(src.includes('"visibility", ['), f).toBe(false);
      expect(src.includes("THERAPIST_ELIGIBILITY.visibilities"), f).toBe(false);
    }
  });

  it("every public query file applies the shared predicate", () => {
    for (const f of PUBLIC_QUERY_FILES) {
      expect(read(f).includes("applyEligibility"), f).toBe(true);
    }
  });

  it("no public path selects the whole therapist row", () => {
    for (const f of [...PUBLIC_QUERY_FILES, "routes/therapists.$slug.tsx"]) {
      expect(read(f).includes('select("*")'), f).toBe(false);
    }
  });

  it("the public select statement lists only allowlisted columns", () => {
    expect(PUBLIC_THERAPIST_SELECT.split(", ")).toEqual([...PUBLIC_THERAPIST_COLUMNS]);
    for (const col of PRIVATE_THERAPIST_COLUMNS) {
      expect(PUBLIC_THERAPIST_COLUMNS as readonly string[]).not.toContain(col);
    }
  });

  it("recordCtaClick remains the only path returning a phone number", () => {
    const src = read("lib/therapists.functions.ts");
    const phoneSelects = src.match(/select\("phone"\)/g) ?? [];
    expect(phoneSelects.length).toBe(1);
    // …and it goes through the privileged server client, not the public one.
    const ctaSection = src.slice(src.indexOf("export const recordCtaClick"));
    expect(ctaSection.includes("client.server")).toBe(true);
    expect(ctaSection.includes("publicClient()")).toBe(false);
  });

  it("production search remains Unified-only with no Legacy fallback", () => {
    const src = read("routes/search.tsx");
    expect(src.includes('if (!opts.isDev) return "unified"')).toBe(true);
    expect(src.includes("catch")).toBe(false);
  });
});
