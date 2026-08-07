/**
 * Phase 4 — end-to-end validation of explicit treatment-domain recognition
 * for the therapist profile field `full_description` ("קצת עליי").
 *
 * VALIDATION ONLY. These tests drive the REAL production extraction path
 * (`loadFeedbackCatalog` → `findDirectEvidence` / `combineFeedbackDomains`
 * from `src/lib/profile-domain-feedback.ts`, the exact functions used by the
 * `getSemanticFeedback` server function) against a read-only snapshot of the
 * live active catalog taken after the Phase 3 migration. There is no second
 * extractor implementation here, no network access and no LLM call.
 */
import { describe, expect, it } from "bun:test";
import {
  combineFeedbackDomains,
  findDirectEvidence,
  loadFeedbackCatalog,
  normalizeFeedbackText,
  type FeedbackDb,
} from "./profile-domain-feedback";
import { createFakeSupabase } from "./test-support/fake-supabase";
import { LIVE_ACTIVE_CATALOG } from "./test-support/live-catalog-snapshot";

const CATALOG = LIVE_ACTIVE_CATALOG;

/** Production extraction, exactly as the editor panel consumes it. */
const domains = (text: string): string[] =>
  combineFeedbackDomains(text, CATALOG, []).map((d) => d.slug);

const slugById = new Map(CATALOG.problems.map((p) => [p.problem_id ?? p.id, p.slug]));
const aliasesOf = (slug: string): string[] =>
  CATALOG.aliases.filter((a) => slugById.get(a.problem_id) === slug).map((a) => a.alias);
const nameOf = (slug: string): string =>
  CATALOG.problems.find((p) => p.slug === slug)!.name_he;

/* ------------------------------------------------------------------ */
/* Catalog snapshot sanity (Phase 3 invariants)                        */
/* ------------------------------------------------------------------ */

describe("live catalog snapshot reflects the applied Phase 3 state", () => {
  it("carries the 21 active canonical domains including both Phase 3 additions", () => {
    expect(CATALOG.problems).toHaveLength(21);
    expect(nameOf("personality_disorders")).toBe("הפרעות אישיות");
    expect(nameOf("sexual_abuse_trauma")).toBe("פגיעות מיניות וטראומה מינית");
  });

  it("has no normalized duplicate alias inside a domain and no active-to-active collision", () => {
    const perDomain = new Set<string>();
    const owners = new Map<string, Set<string>>();
    for (const a of CATALOG.aliases) {
      const key = `${a.problem_id}|${normalizeFeedbackText(a.alias)}`;
      expect(perDomain.has(key)).toBe(false);
      perDomain.add(key);
      const set = owners.get(normalizeFeedbackText(a.alias)) ?? new Set<string>();
      set.add(slugById.get(a.problem_id)!);
      owners.set(normalizeFeedbackText(a.alias), set);
    }
    expect([...owners.entries()].filter(([, s]) => s.size > 1)).toEqual([]);
  });

  it("contains the Phase 3 aliases and none of the removed unsafe standalone terms", () => {
    for (const [slug, alias] of [
      ["personality_disorders", "הפרעת אישיות"],
      ["sexual_abuse_trauma", "תקיפה מינית"],
      ["trauma", "טראומה מורכבת"],
      ["anxiety", "חרדת בריאות"],
      ["ocd_compulsions", "מחשבות חודרניות"],
      ["self_identity", "משבר זהות"],
      ["emotional_regulation", "התפרצויות זעם"],
      ["neurodiversity", "ספקטרום אוטיסטי"],
      ["eating_body", "דימוי גוף שלילי"],
      ["social_belonging", "בדידות"],
      ["relationships", "גירושין"],
      ["performance_functioning", "דחיינות"],
      ["family_parenting", "מתח הורי"],
    ] as const) {
      expect(aliasesOf(slug)).toContain(alias);
    }
    const removed = [
      "אבל", "אובדן", "שכול", "לחץ", "משבר", "כעס", "זעם", "סמים", "פרידה",
      "דאון", "גמור", "שחוק", "כפייתיות", "פלאשבקים", "סיוטים", "שימוש לרעה",
      "הורים", "עצמי",
    ];
    for (const term of removed) {
      expect(
        CATALOG.aliases.some((a) => normalizeFeedbackText(a.alias) === normalizeFeedbackText(term)),
      ).toBe(false);
    }
  });

  it("loads through the production loader with exactly two queries", async () => {
    const db = createFakeSupabase({
      problems: CATALOG.problems.map((p) => ({ ...p, is_active: true })),
      problem_aliases: CATALOG.aliases.map((a) => ({
        problem_id: Number(a.problem_id),
        alias: a.alias,
      })),
    });
    const loaded = await loadFeedbackCatalog(db as unknown as FeedbackDb);
    expect(db.reads).toEqual(["problems", "problem_aliases"]);
    expect(loaded.problems).toHaveLength(21);
    expect(loaded.aliases).toHaveLength(CATALOG.aliases.length);
    expect(domains("אני מטפל בחרדה ובדיכאון")).toEqual(
      combineFeedbackDomains("אני מטפל בחרדה ובדיכאון", loaded, []).map((d) => d.slug),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Synthetic profile corpus                                            */
/* ------------------------------------------------------------------ */

type Fixture = { id: string; text: string; expected: string[] };

const PROFILES: Fixture[] = [
  // --- single explicit domain, realistic sentences -------------------
  {
    id: "single-anxiety",
    text: "פסיכולוגית קלינית בעלת ניסיון של 12 שנה. אני מטפלת בחרדה ובהתקפי פאניקה אצל מבוגרים.",
    expected: ["anxiety"],
  },
  {
    id: "single-depression",
    text: "אני מטפל בדיכאון ובמצבים דיכאוניים, כולל תסמיני דיכאון ממושכים, בגישה דינמית.",
    expected: ["depression"],
  },
  {
    id: "single-personality-disorders",
    text: "פסיכותרפיסט העובד עם הפרעות אישיות בגישה דינמית ארוכת טווח בקליניקה בחיפה.",
    expected: ["personality_disorders"],
  },
  {
    id: "single-personality-disorder-singular-alias",
    text: "אני מלווה מטופלים המתמודדים עם הפרעת אישיות גבולית לאורך תהליך ממושך.",
    expected: ["personality_disorders"],
  },
  {
    id: "single-ocd-canonical-and-alias",
    text: "מטפלת ב-OCD, כלומר הפרעה טורדנית כפייתית, וגם במחשבות חודרניות ובטקסים כפייתיים.",
    expected: ["ocd_compulsions"],
  },
  {
    id: "single-eating-body",
    text: "קלינאית המטפלת בהפרעות אכילה, אנורקסיה ובולימיה, וכן בדימוי גוף שלילי.",
    expected: ["eating_body"],
  },
  {
    id: "single-family-parenting",
    text: "מדריך הורים מוסמך. אני עוסק בקשיים בהורות, מתח הורי ויחסי הורים וילדים.",
    expected: ["family_parenting"],
  },
  {
    id: "single-social-belonging",
    text: "אני מטפלת בבדידות, בקשיים חברתיים ובתחושת חוסר שייכות בקרב צעירים.",
    expected: ["social_belonging"],
  },
  {
    id: "single-performance",
    text: "מטפל בשחיקה בעבודה, בדחיינות ובקשיים בתפקוד היומיומי.",
    expected: ["performance_functioning"],
  },
  {
    id: "single-emotional-regulation",
    text: "אני עובדת על ויסות רגשי, על הצפה רגשית ועל התפרצויות זעם אצל מתבגרים.",
    expected: ["emotional_regulation"],
  },
  {
    id: "single-neurodiversity",
    text: "ליווי מאובחנים עם ADHD והפרעת קשב וריכוז, וכן אנשים על הספקטרום האוטיסטי.",
    expected: ["neurodiversity"],
  },
  {
    id: "single-self-identity",
    text: "אני מטפל במשבר זהות, בקשיי זהות ובדימוי עצמי נמוך אצל צעירים בשנות העשרים.",
    expected: ["self_identity"],
  },
  {
    id: "single-grief",
    text: "אני מטפלת באבל ובאובדן — התמודדות עם אבל אחרי מות אדם קרוב, בליווי ארוך טווח.",
    expected: ["grief_loss"],
  },

  // --- overlapping wording (documented current behavior) -------------
  {
    id: "overlap-sexual-abuse-contains-trauma",
    text: "מטפלת בטראומה מינית ובטראומה בילדות, בגישה מבוססת מודעות לטראומה.",
    expected: ["sexual_abuse_trauma", "trauma"],
  },
  {
    id: "overlap-sexual-abuse-victims",
    text: "אני מלווה נפגעות תקיפה מינית ומטפלת בפגיעה מינית ובטראומה מינית מתמשכת.",
    expected: ["sexual_abuse_trauma", "trauma"],
  },
  {
    id: "overlap-complex-trauma-abbreviations",
    text: "עובדת סוציאלית קלינית המתמחה בטראומה מורכבת ובטראומת ילדות (CPTSD).",
    expected: ["trauma"],
  },

  // --- several explicit domains --------------------------------------
  {
    id: "multi-relationships-couples",
    text: "מטפל זוגי: קשיים בזוגיות, משבר זוגי ותהליך גירושין, וגם התמודדות עם פרידה זוגית.",
    expected: ["relationships"],
  },
  {
    id: "multi-five-domains",
    text: "קליניקה בתל אביב: חרדה, דיכאון, טראומה, אבל ואובדן, ומשברי חיים.",
    expected: ["anxiety", "depression", "trauma", "grief_loss", "life_transitions"],
  },
  {
    id: "multi-addiction-and-functioning",
    text: "אני עוסק בהתמכרויות ותלות: התמכרות לאלכוהול, התנהגות ממכרת וגם דחיינות כרונית.",
    expected: ["addiction", "performance_functioning"],
  },
  {
    id: "multi-professional-paragraph",
    text:
      "פסיכולוג קליני מומחה. אני מטפל במבוגרים ובמתבגרים ומתמחה בטיפול בדיכאון, ב-OCD, " +
      "בהתמכרויות, בהפרעות חרדה ובפוסט טראומה, וכן בליווי אנשים המתמודדים עם קשיים ומשברי חיים.",
    expected: ["depression", "ocd_compulsions", "addiction", "anxiety", "trauma", "life_transitions"],
  },

  // --- deduplication -------------------------------------------------
  {
    id: "dedup-depression-repeated",
    text:
      "אני מטפל בדיכאון. דיכאונות ממושכים הם תחום ההתמחות שלי, ואת המשפט \"אני בדיכאון\" " +
      "אני שומע כאן הרבה. תסמיני דיכאון מקבלים אצלי מקום מרכזי.",
    expected: ["depression"],
  },
  {
    id: "dedup-anxiety-canonical-plus-aliases",
    text: "חרדה ופחדים הם ליבת העבודה שלי: חרדות, הפרעת חרדה מוכללת, חרדה חברתית ופוביות.",
    expected: ["anxiety"],
  },

  // --- ambiguous / must not match ------------------------------------
  {
    id: "negative-conjunction-and-stress",
    text: "אני עוסקת בליווי אישי ובצמיחה, אבל לא בטיפול תרופתי. יש לחץ בחיים של כולנו.",
    expected: [],
  },
  {
    id: "negative-address-and-generic-bio",
    text: "הקליניקה שלי ברחוב הורים 4. אני מטפל באנשים בכל הגילים, ליווי אישי ומשפחה.",
    expected: [],
  },
  {
    id: "negative-educational-psychologist",
    text: "פסיכולוג חינוכי בעל ניסיון של 12 שנה בעבודה עם בתי ספר, צוותי חינוך והשתלמויות מורים.",
    expected: [],
  },
];

describe("Phase 4 synthetic profile corpus", () => {
  it("covers 15–25 realistic profiles", () => {
    expect(PROFILES.length).toBeGreaterThanOrEqual(15);
    expect(PROFILES.length).toBeLessThanOrEqual(25);
  });

  for (const f of PROFILES) {
    it(`${f.id} resolves to its expected canonical domains`, () => {
      const out = domains(f.text);
      expect([...out].sort()).toEqual([...f.expected].sort());
      expect(new Set(out).size).toBe(out.length);
    });
  }
});

/* ------------------------------------------------------------------ */
/* A. Direct canonical-name recognition                                */
/* ------------------------------------------------------------------ */

describe("A. canonical Hebrew names inside realistic sentences", () => {
  const cases: [string, string][] = [
    ["anxiety", "אני מטפלת בחרדה ופחדים בקרב מבוגרים בקליניקה פרטית."],
    ["depression", "התמחותי היא דיכאון וכאב רגשי, בליווי ארוך טווח."],
    ["personality_disorders", "אני עוסק בהפרעות אישיות בגישה מבוססת מנטליזציה."],
    ["sexual_abuse_trauma", "אני מלווה מטופלות בתחום פגיעות מיניות וטראומה מינית."],
    ["eating_body", "עבודתי מתמקדת באכילה ודימוי גוף אצל נשים צעירות."],
    ["family_parenting", "אני מטפל בתחום משפחה והורות, כולל הדרכת הורים."],
    ["emotional_regulation", "אני מלמדת מיומנויות של ויסות רגשי במסגרת טיפול קבוצתי."],
  ];
  for (const [slug, text] of cases) {
    it(`recognizes ${slug} from its canonical name`, () => {
      expect(domains(text)).toContain(slug);
    });
  }
});

/* ------------------------------------------------------------------ */
/* B. Alias recognition, from the real catalog                          */
/* ------------------------------------------------------------------ */

describe("B. aliases taken from the live catalog map to their own domain", () => {
  /** Phase 3 aliases, read out of the catalog rather than re-invented. */
  const sampled: [string, string][] = [
    ["trauma", "טראומה מורכבת"],
    ["trauma", "הפרעת דחק פוסט טראומטית"],
    ["anxiety", "חרדת בריאות"],
    ["anxiety", "התקפי פאניקה"],
    ["ocd_compulsions", "טקסים כפייתיים"],
    ["self_identity", "קשיים בזהות העצמית"],
    ["family_parenting", "קונפליקטים בין הורים לילדים"],
    ["emotional_regulation", "קשיים בשליטה בכעסים"],
    ["neurodiversity", "קשיי קשב וריכוז"],
    ["eating_body", "קשיים בדימוי הגוף"],
    ["social_belonging", "קשיים ביצירת קשרים חברתיים"],
    ["relationships", "התמודדות עם גירושין"],
    ["performance_functioning", "שחיקה מקצועית"],
    ["personality_disorders", "הפרעות אישיות"],
    ["sexual_abuse_trauma", "התעללות מינית"],
    ["grief_loss", "אבל ושכול"],
    ["life_transitions", "מעבר בחיים"],
    ["addiction", "התנהגות ממכרת"],
  ];

  for (const [slug, alias] of sampled) {
    it(`"${alias}" belongs to ${slug} in the catalog and resolves to it`, () => {
      expect(aliasesOf(slug)).toContain(alias);
      const out = domains(`בקליניקה שלי אני מטפל ב${alias} כתחום מרכזי, לאורך תהליך ממושך.`);
      expect(out).toContain(slug);
      // Only trauma-family overlap may legitimately add a second domain.
      const extra = out.filter((s) => s !== slug);
      expect(extra.every((s) => s === "trauma" || s === "sexual_abuse_trauma")).toBe(true);
    });
  }
});

/* ------------------------------------------------------------------ */
/* E. Natural Hebrew formatting                                        */
/* ------------------------------------------------------------------ */

describe("E. natural profile formatting", () => {
  const cases: [string, string[]][] = [
    ["תחומי הטיפול שלי: חרדה, דיכאון, ו-OCD.", ["anxiety", "depression", "ocd_compulsions"]],
    ["אני מטפלת ב(הפרעות אכילה) ובדימוי גוף.", ["eating_body"]],
    ["טראומה / פוסט טראומה / PTSD — התמחות עיקרית.", ["trauma"]],
    ["טיפול בהפרעת קשב-וריכוז ובקשיי קשב וריכוז.", ["neurodiversity"]],
    ["תחומים:\nחרדה\nדיכאון\nטראומה\n", ["anxiety", "depression", "trauma"]],
    ["מטפל ב O.C.D. ובמחשבות טורדניות.", ["ocd_compulsions"]],
    ["הפרעות אישיות (גבולית, נרקיסיסטית) — עבודה דינמית.", ["personality_disorders"]],
  ];
  for (const [text, expected] of cases) {
    it(`handles ${JSON.stringify(text)}`, () => {
      expect([...domains(text)].sort()).toEqual([...expected].sort());
    });
  }
});

/* ------------------------------------------------------------------ */
/* F. Negative / false-positive regression                             */
/* ------------------------------------------------------------------ */

describe("F. Phase 3 removed and deferred expressions stay unmapped", () => {
  const removedOrDeferred = [
    "אבל", "אובדן", "שכול", "לחץ", "משבר", "כעס", "זעם", "סמים", "פרידה",
    "דאון", "גמור", "שחוק", "כפייתיות", "פלאשבקים", "סיוטים", "שימוש לרעה",
    "הורים", "עצמי", "זהות", "הורות", "ילדים", "משפחה", "מחלות נפש",
    "קשיי שינה", "הפרעות שינה", "נדודי שינה",
  ];
  for (const term of removedOrDeferred) {
    it(`"${term}" alone does not create a treatment domain`, () => {
      expect(domains(`אני מטפל ב${term} בקליניקה שלי בתל אביב, בגישה אינטגרטיבית ורגישה.`)).toEqual(
        [],
      );
    });
  }

  it("keeps the contextual phrases that Phase 3 deliberately preserved", () => {
    expect(domains("אני מלווה תהליכי אבל ושכול לאחר אובדן פתאומי.")).toEqual(["grief_loss"]);
    expect(domains("אני מטפלת בהתמודדות עם אובדן ובתהליך אבל ממושך.")).toEqual(["grief_loss"]);
    expect(domains("אני מטפל בפרידה זוגית ובהתמודדות עם פרידה.")).toEqual(["relationships"]);
    expect(domains("אני עובדת על קשיים בשליטה בכעסים עם מתבגרים.")).toEqual([
      "emotional_regulation",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* G. Overlapping wording                                              */
/* ------------------------------------------------------------------ */

describe("G. overlapping expressions", () => {
  it("sexual-abuse wording surfaces its own domain, plus trauma only via the literal word", () => {
    expect([...domains("אני מטפלת בפגיעות מיניות בקליניקה.")].sort()).toEqual([
      "sexual_abuse_trauma",
    ]);
    // "טראומה מינית" literally contains "טראומה", an approved trauma alias, so
    // both domains legitimately carry explicit evidence. Intended behavior.
    expect([...domains("אני מטפלת בטראומה מינית.")].sort()).toEqual([
      "sexual_abuse_trauma",
      "trauma",
    ]);
  });

  it("distinguishes self-image from body-image wording", () => {
    expect(domains("אני מטפל בדימוי עצמי נמוך.")).toEqual(["self_identity"]);
    expect(domains("אני מטפל בדימוי גוף שלילי.")).toEqual(["eating_body"]);
  });

  it("does not duplicate a domain when nested expressions co-occur", () => {
    const out = domains(
      "אני מטפל בחרדה, בחרדה חברתית, בהפרעת חרדה מוכללת ובהתקפי פאניקה חוזרים.",
    );
    expect(out).toEqual(["anxiety"]);
  });
});

/* ------------------------------------------------------------------ */
/* H. Empty and irrelevant content                                     */
/* ------------------------------------------------------------------ */

describe("H. empty and irrelevant content", () => {
  for (const text of ["", "   ", "\n\t  \n", "אני עובד בקליניקה בירושלים מאז 2011."]) {
    it(`returns no domains for ${JSON.stringify(text)}`, () => {
      expect(domains(text)).toEqual([]);
    });
  }

  it("ignores semantic suggestions that carry no explicit textual evidence", () => {
    const text = "אני עובד בקליניקה בירושלים מאז 2011 ומלווה תהליכים אישיים.";
    expect(combineFeedbackDomains(text, CATALOG, [{ slug: "anxiety", weight: 9 }])).toEqual([]);
  });

  it("returns names alongside slugs for the editor panel", () => {
    expect(combineFeedbackDomains("אני מטפל בהפרעות אישיות.", CATALOG, [])).toEqual([
      { slug: "personality_disorders", name: "הפרעות אישיות" },
    ]);
  });

  it("orders direct evidence by first occurrence in the text", () => {
    const ev = findDirectEvidence("קודם דיכאון ואחר כך חרדה.", CATALOG);
    expect(ev.map((e) => e.slug)).toEqual(["depression", "anxiety"]);
  });
});