/**
 * Phase 3A — treatment-domain catalog integrity tests.
 *
 * The migration is NOT applied to the live database in this phase. These
 * tests parse the migration SQL, replay its semantics against an in-memory
 * fixture that mirrors the relevant real catalog rows, and assert catalog
 * integrity plus idempotency. Nothing here touches production search.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  combineFeedbackDomains,
  normalizeFeedbackText,
  type FeedbackCatalog,
} from "./profile-domain-feedback";

const MIGRATION_PATH =
  "supabase/migrations/20260806082039_83f6bc89-0c47-48a1-a9ac-02e850f3d868.sql";
const SQL = readFileSync(MIGRATION_PATH, "utf8");

/* ------------------------------ parsing -------------------------------- */

type NewProblem = { slug: string; name_he: string; name_en: string };
type Spec = {
  newProblems: NewProblem[];
  aliases: { slug: string; alias: string }[];
  moved: { child: string; parent: string; alias: string }[];
  unsafe: string[];
};

function block(startMarker: string): string {
  const i = SQL.indexOf(startMarker);
  expect(i).toBeGreaterThan(-1);
  const j = SQL.indexOf("\n)", i);
  return SQL.slice(i, j);
}

function parseSpec(): Spec {
  const newProblems = [
    ...SQL.matchAll(/SELECT '([a-z_]+)', '([^']+)', '([^']+)', NULL, true/g),
  ].map((m) => ({ slug: m[1]!, name_he: m[2]!, name_en: m[3]! }));

  const aliasBlock = block("WITH candidates(slug, alias) AS (");
  const aliases = [...aliasBlock.matchAll(/\('([a-z_]+)',\s*'([^']+)'\)/g)].map((m) => ({
    slug: m[1]!,
    alias: m[2]!,
  }));

  const movedBlock = block("WITH moved(child_slug, parent_slug, alias) AS (");
  const moved = [...movedBlock.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*'([^']+)'\)/g)].map(
    (m) => ({ child: m[1]!, parent: m[2]!, alias: m[3]! }),
  );

  const unsafeBlock = SQL.slice(SQL.lastIndexOf("lower(trim(a.alias)) IN ("));
  const unsafe = [...unsafeBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]!);

  return { newProblems, aliases, moved, unsafe };
}

const spec = parseSpec();

/* ------------------------------ fixture -------------------------------- */

type ProblemRow = {
  id: number;
  slug: string;
  name_he: string;
  name_en: string;
  is_active: boolean;
  parent_id: number | null;
};
type AliasRow = { id: number; problem_id: number; alias: string };
type State = {
  problems: ProblemRow[];
  aliases: AliasRow[];
  nextProblemId: number;
  nextAliasId: number;
};

const ACTIVE: [number, string, string][] = [
  [1, "anxiety", "חרדה ופחדים"],
  [2, "depression", "דיכאון וכאב רגשי"],
  [3, "trauma", "טראומה ומשברים"],
  [4, "relationships", "זוגיות והיקשרות"],
  [5, "family_parenting", "משפחה והורות"],
  [6, "social_belonging", "בדידות ושייכות"],
  [7, "self_identity", "דימוי עצמי וזהות"],
  [8, "emotional_regulation", "ויסות רגשי"],
  [9, "ocd_compulsions", "OCD והתנהגויות כפייתיות"],
  [10, "addiction", "התמכרויות ותלות"],
  [11, "eating_body", "אכילה ודימוי גוף"],
  [13, "grief_loss", "אבל ואובדן"],
  [14, "life_transitions", "מעברי חיים והסתגלות"],
  [15, "performance_functioning", "עבודה, לימודים ותפקוד"],
  [18, "neurodiversity", "נוירודיברסיות ואתגרים קוגניטיביים"],
  [19, "somatic", "גוף-נפש וסימפטומים גופניים"],
];

/** Inactive children: [id, slug, parent_id]. */
const INACTIVE: [number, string, number | null][] = [
  [26, "low_mood", 2],
  [50, "ptsd", 3],
  [51, "childhood_trauma", 3],
  [53, "panic", 1],
  [54, "social_anxiety", 1],
  [55, "health_anxiety", 1],
  [56, "intrusive_thoughts", 9],
  [57, "identity_crisis", 7],
  [58, "low_self_esteem", 7],
  [59, "parenting_stress", 5],
  [60, "anger", 8],
  [61, "emotional_overwhelm", 8],
  [62, "body_image", 11],
  [63, "loneliness", 6],
  [64, "divorce", 4],
  [65, "couples_conflict", 4],
  [66, "breakup", 4],
  [67, "burnout", 15],
  [68, "procrastination", 15],
  [69, "substance_use", 10],
];

/** Alias rows mirroring the real state discovered in preflight. */
const FIXTURE_ALIASES: [number, number, string][] = [
  // Phase 2 aliases on active domains (already applied in production)
  [130, 2, "אין לי כוח לכלום"],
  [131, 2, "אני בדיכאון"],
  [144, 13, "איבדתי מישהו קרוב"],
  [146, 13, "אני מתאבל"],
  [253, 13, "אבל"],
  [254, 13, "שכול"],
  [255, 13, "אובדן"],
  [259, 13, "איבדתי מישהו קרוב"],
  [260, 13, "אני מתאבל"],
  [263, 63, "בדידות"],
  [274, 53, "התקף פאניקה"],
  [275, 53, "התקפי פאניקה"],
  [283, 50, "פוסט טראומה"],
  [286, 50, "פלאשבקים"],
  [287, 50, "סיוטים"],
  [300, 67, "שחיקה"],
  [301, 67, "שחוק"],
  [305, 67, "גמור"],
  [309, 67, "שחיקה בעבודה"],
  [315, 60, "כעס"],
  [318, 60, "זעם"],
  [321, 60, "התפרצויות זעם"],
  [325, 54, "חרדה חברתית"],
  [332, 58, "דימוי עצמי נמוך"],
  [333, 58, "ביטחון עצמי נמוך"],
  [334, 58, "חוסר ביטחון עצמי"],
  [342, 65, "משבר זוגי"],
  [353, 64, "גירושין"],
  [361, 61, "הצפה רגשית"],
  [380, 62, "דימוי גוף"],
  [392, 59, "מתקשה להורות"],
  [393, 59, "מתקשה להורות"],
  [398, 69, "סמים"],
  [405, 26, "דאון"],
  [409, 26, "אני על הפנים"],
  [415, 68, "דחיינות"],
  [423, 55, "חרדת בריאות"],
  [430, 66, "פרידה"],
  [444, 57, "משבר זהות"],
  [456, 51, "טראומת ילדות"],
  [467, 56, "מחשבות טורדניות"],
  [468, 56, "מחשבות חודרניות"],
  [485, 2, "אני על הפנים"],
  [487, 2, "אין לי כוח לכלום"],
  [502, 7, "ביטחון עצמי נמוך"],
  [509, 3, "פוסט טראומה"],
  [515, 9, "מחשבות טורדניות"],
  [527, 7, "דימוי עצמי נמוך"],
  [533, 7, "חוסר ביטחון עצמי"],
  [540, 3, "טראומה"],
  [541, 1, "חרדה"],
  [542, 2, "דיכאון"],
  [543, 9, "OCD"],
  [544, 10, "התמכרויות"],
  [545, 13, "אבל ושכול"],
  [546, 5, "הדרכת הורים"],
  [547, 1, "חרדות"],
  [548, 14, "משברי חיים"],
  [549, 7, "קשיים בדימוי העצמי"],
];

function initialState(): State {
  const problems: ProblemRow[] = [
    ...ACTIVE.map(([id, slug, name_he]) => ({
      id,
      slug,
      name_he,
      name_en: slug,
      is_active: true,
      parent_id: null,
    })),
    ...INACTIVE.map(([id, slug, parent_id]) => ({
      id,
      slug,
      name_he: slug,
      name_en: slug,
      is_active: false,
      parent_id,
    })),
  ];
  const aliases: AliasRow[] = FIXTURE_ALIASES.map(([id, problem_id, alias]) => ({
    id,
    problem_id,
    alias,
  }));
  return { problems, aliases, nextProblemId: 100, nextAliasId: 1000 };
}

const norm = (s: string) => normalizeFeedbackText(s);

/** Replay the migration semantics. */
function applyMigration(state: State): {
  insertedProblems: number;
  insertedAliases: number;
  deleted: number;
} {
  let insertedProblems = 0;
  let insertedAliases = 0;
  let deleted = 0;

  // 1. new canonical problems
  for (const np of spec.newProblems) {
    if (state.problems.some((p) => p.slug === np.slug)) continue;
    state.problems.push({
      id: state.nextProblemId++,
      slug: np.slug,
      name_he: np.name_he,
      name_en: np.name_en,
      is_active: true,
      parent_id: null,
    });
    insertedProblems++;
  }

  // 2. aliases on active domains
  for (const c of spec.aliases) {
    const p = state.problems.find((x) => x.slug === c.slug && x.is_active);
    if (!p) continue;
    const exists = state.aliases.some(
      (a) => a.problem_id === p.id && norm(a.alias) === norm(c.alias),
    );
    if (exists) continue;
    state.aliases.push({ id: state.nextAliasId++, problem_id: p.id, alias: c.alias });
    insertedAliases++;
  }

  // 3. same-domain duplicates → retain lowest id
  const seen = new Set<string>();
  const kept: AliasRow[] = [];
  for (const a of [...state.aliases].sort((x, y) => x.id - y.id)) {
    const key = `${a.problem_id}|${norm(a.alias)}`;
    if (seen.has(key)) {
      deleted++;
      continue;
    }
    seen.add(key);
    kept.push(a);
  }
  state.aliases = kept;

  // 4. inactive-child duplicates of approved active-parent aliases
  for (const m of spec.moved) {
    const child = state.problems.find((p) => p.slug === m.child && !p.is_active);
    const parent = state.problems.find((p) => p.slug === m.parent && p.is_active);
    if (!child || !parent) continue;
    const parentHas = state.aliases.some(
      (a) => a.problem_id === parent.id && norm(a.alias) === norm(m.alias),
    );
    if (!parentHas) continue;
    const before = state.aliases.length;
    state.aliases = state.aliases.filter(
      (a) => !(a.problem_id === child.id && norm(a.alias) === norm(m.alias)),
    );
    deleted += before - state.aliases.length;
  }

  // 5. unsafe standalone aliases
  const unsafe = new Set(spec.unsafe.map(norm));
  const before = state.aliases.length;
  state.aliases = state.aliases.filter((a) => !unsafe.has(norm(a.alias)));
  deleted += before - state.aliases.length;

  return { insertedProblems, insertedAliases, deleted };
}

const migrated = (() => {
  const s = initialState();
  const first = applyMigration(s);
  return { state: s, first };
})();

const slugById = (s: State) => new Map(s.problems.map((p) => [p.id, p.slug]));

/* ------------------------------- tests --------------------------------- */

describe("Phase 3A new canonical domains", () => {
  it("adds exactly two active, top-level slugs with the approved Hebrew names", () => {
    expect(spec.newProblems.map((p) => p.slug).sort()).toEqual([
      "personality_disorders",
      "sexual_abuse_trauma",
    ]);
    for (const [slug, name] of [
      ["personality_disorders", "הפרעות אישיות"],
      ["sexual_abuse_trauma", "פגיעות מיניות וטראומה מינית"],
    ] as const) {
      const rows = migrated.state.problems.filter((p) => p.slug === slug);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.is_active).toBe(true);
      expect(rows[0]!.parent_id).toBeNull();
      expect(rows[0]!.name_he).toBe(name);
    }
  });

  it("keeps sexual-abuse terminology out of trauma / sexuality domains", () => {
    const byId = slugById(migrated.state);
    for (const alias of ["פגיעה מינית", "תקיפה מינית", "התעללות מינית", "טראומה מינית"]) {
      const owners = migrated.state.aliases
        .filter((a) => norm(a.alias) === norm(alias))
        .map((a) => byId.get(a.problem_id));
      expect(owners).toEqual(["sexual_abuse_trauma"]);
    }
  });
});

describe("Phase 3A alias mapping", () => {
  it("maps every approved alias to its intended active slug", () => {
    const byId = slugById(migrated.state);
    for (const c of spec.aliases) {
      const owners = migrated.state.aliases
        .filter((a) => norm(a.alias) === norm(c.alias))
        .map((a) => byId.get(a.problem_id));
      expect(owners).toContain(c.slug);
    }
  });

  it("promotes inactive-child terminology to the approved active parents", () => {
    const parents: Record<string, string> = {
      בדידות: "social_belonging",
      גירושין: "relationships",
      "משבר זוגי": "relationships",
      דחיינות: "performance_functioning",
      "שחיקה בעבודה": "performance_functioning",
      "דימוי גוף": "eating_body",
      "הצפה רגשית": "emotional_regulation",
      "התפרצויות זעם": "emotional_regulation",
      "התקף פאניקה": "anxiety",
      "חרדה חברתית": "anxiety",
      "חרדת בריאות": "anxiety",
      "טראומת ילדות": "trauma",
      "מחשבות חודרניות": "ocd_compulsions",
      "משבר זהות": "self_identity",
    };
    const byId = slugById(migrated.state);
    for (const [alias, parent] of Object.entries(parents)) {
      const owners = migrated.state.aliases
        .filter((a) => norm(a.alias) === norm(alias))
        .map((a) => byId.get(a.problem_id));
      expect(owners).toEqual([parent]);
    }
  });

  it("removes every unsafe exact standalone alias", () => {
    const forbidden = [
      "אבל",
      "אובדן",
      "שכול",
      "לחץ",
      "משבר",
      "כעס",
      "זעם",
      "סמים",
      "פרידה",
      "דאון",
      "גמור",
      "שחוק",
      "כפייתיות",
      "פלאשבקים",
      "סיוטים",
      "שימוש לרעה",
      "הורים",
      "עצמי",
    ];
    for (const term of forbidden) {
      expect(migrated.state.aliases.some((a) => norm(a.alias) === norm(term))).toBe(false);
    }
  });

  it("keeps longer contextual phrases", () => {
    for (const phrase of ["אבל ושכול", "פרידה זוגית", "התמודדות עם פרידה", "קשיים בשליטה בכעסים"]) {
      expect(migrated.state.aliases.some((a) => norm(a.alias) === norm(phrase))).toBe(true);
    }
  });

  it("adds no broad standalone alias for deferred terms", () => {
    for (const term of [
      "מחלות נפש",
      "הורות",
      "ילדים",
      "משפחה",
      "זהות",
      "קשיי שינה",
      "הפרעות שינה",
      "נדודי שינה",
    ]) {
      expect(spec.aliases.some((c) => norm(c.alias) === norm(term))).toBe(false);
    }
  });
});

describe("Phase 3A catalog integrity", () => {
  it("leaves no normalized duplicate inside a canonical domain", () => {
    const seen = new Set<string>();
    for (const a of migrated.state.aliases) {
      const key = `${a.problem_id}|${norm(a.alias)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("leaves no normalized alias mapping to two active domains", () => {
    const byId = new Map(migrated.state.problems.map((p) => [p.id, p]));
    const owners = new Map<string, Set<string>>();
    for (const a of migrated.state.aliases) {
      const p = byId.get(a.problem_id)!;
      if (!p.is_active) continue;
      const set = owners.get(norm(a.alias)) ?? new Set<string>();
      set.add(p.slug);
      owners.set(norm(a.alias), set);
    }
    const collisions = [...owners.entries()].filter(([, s]) => s.size > 1);
    expect(collisions).toEqual([]);
  });

  it("keeps every inactive canonical row present, inactive, unrenamed and unreparented", () => {
    const before = initialState().problems.filter((p) => !p.is_active);
    for (const p of before) {
      const after = migrated.state.problems.find((x) => x.id === p.id);
      expect(after).toBeDefined();
      expect(after!.is_active).toBe(false);
      expect(after!.slug).toBe(p.slug);
      expect(after!.name_he).toBe(p.name_he);
      expect(after!.parent_id).toBe(p.parent_id);
    }
  });

  it("changes counts only as projected", () => {
    const start = initialState();
    expect(migrated.state.problems.length).toBe(start.problems.length + 2);
    expect(migrated.state.problems.filter((p) => p.is_active).length).toBe(
      start.problems.filter((p) => p.is_active).length + 2,
    );
    expect(migrated.first.insertedProblems).toBe(2);
    expect(migrated.first.insertedAliases).toBeGreaterThan(0);
    expect(migrated.first.deleted).toBeGreaterThan(0);
  });

  it("is idempotent on a second application", () => {
    const s = initialState();
    applyMigration(s);
    const problemsAfter1 = s.problems.length;
    const aliasesAfter1 = s.aliases.length;
    const second = applyMigration(s);
    expect(second.insertedProblems).toBe(0);
    expect(second.insertedAliases).toBe(0);
    expect(second.deleted).toBe(0);
    expect(s.problems.length).toBe(problemsAfter1);
    expect(s.aliases.length).toBe(aliasesAfter1);
  });

  it("contains no wildcard deletion and no schema change", () => {
    expect(SQL).not.toMatch(
      /LIKE|ILIKE|~\*|DROP |ALTER TABLE|CREATE INDEX|UPDATE public\.problems/,
    );
  });
});

/* ---------------- Phase 2 full-description fixtures --------------------- */

const FIXTURE_1 = `פסיכולוג קליני מומחה, מטפל במבוגרים, ובמתבגרים. מתמחה בטיפול בדיכאון, OCD, התמכרויות, הפרעות חרדה, פוסט טראומה (PTSD), וכן בליווי טיפולי של אנשים המתמודדים עם מגוון רחב של קשיים ומשברים בחיים.`;

const FIXTURE_2 = `אני עובדת סוציאלית קלינית, עם התמחות בטראומה, ופסיכותרפיסטית בגישת C.B.T אינטגרטיבי. מטפלת בבני נוער ומשפחותיהם, במבוגרים ובבני הגיל השלישי בתחומים מגוונים כגון: חרדות, O.C.D, דיכאון, משברי חיים, פוסט טראומה, התמכרויות, קשיים בדימוי העצמי, הפרעות אישיות ומחלות נפש, אבל ושכול, הדרכת הורים, פגיעות מיניות ועוד.`;

function migratedCatalog(): FeedbackCatalog {
  const active = migrated.state.problems.filter((p) => p.is_active);
  const ids = new Set(active.map((p) => p.id));
  return {
    problems: active.map((p) => ({ id: String(p.id), slug: p.slug, name_he: p.name_he })),
    aliases: migrated.state.aliases
      .filter((a) => ids.has(a.problem_id))
      .map((a) => ({ problem_id: String(a.problem_id), alias: a.alias })),
  };
}

describe("full-description fixtures against the migrated catalog", () => {
  const catalog = migratedCatalog();
  const slugs = (text: string) => combineFeedbackDomains(text, catalog, []).map((d) => d.slug);

  it("fixture 1 keeps its Phase 2 domains in order", () => {
    const out = slugs(FIXTURE_1);
    const expected = ["depression", "ocd_compulsions", "addiction", "anxiety", "trauma"];
    expect(out.filter((s) => expected.includes(s))).toEqual(expected);
  });

  it("fixture 2 keeps its Phase 2 domains in order and adds the two new domains", () => {
    const out = slugs(FIXTURE_2);
    const expected = [
      "trauma",
      "anxiety",
      "ocd_compulsions",
      "depression",
      "life_transitions",
      "addiction",
      "self_identity",
      "grief_loss",
      "family_parenting",
    ];
    expect(out.filter((s) => expected.includes(s))).toEqual(expected);
    expect(out).toContain("personality_disorders");
    expect(out).toContain("sexual_abuse_trauma");
  });

  it("broad standalone terms stay unmapped", () => {
    for (const text of [
      "מחלות נפש",
      "לחץ",
      "משבר",
      "אבל",
      "הורים",
      "פרידה",
      "כפייתיות",
      "פלאשבקים",
      "סיוטים",
    ]) {
      expect(slugs(`אני מטפל ב${text} בקליניקה שלי בתל אביב`)).toEqual([]);
    }
  });
});
