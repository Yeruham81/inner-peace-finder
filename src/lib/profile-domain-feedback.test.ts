/**
 * Phase P3.2b regression tests — editor-local treatment-domain feedback.
 * Pure/in-memory: no Supabase, no production search surface.
 */
import { describe, expect, it } from "bun:test";
import {
  combineFeedbackDomains,
  findDirectEvidence,
  latinSkeleton,
  loadFeedbackCatalog,
  normalizeFeedbackText,
  orderSemanticOnly,
  phraseHasDirectEvidence,
  type FeedbackCatalog,
  type FeedbackDb,
} from "./profile-domain-feedback";

/* ---------------- catalog fixture (mirrors production active rows) ------- */

const P = {
  depression: { id: "1", slug: "depression", name_he: "דיכאון וכאב רגשי" },
  anxiety: { id: "2", slug: "anxiety", name_he: "חרדה ופחדים" },
  ocd: { id: "3", slug: "ocd_compulsions", name_he: "OCD והתנהגויות כפייתיות" },
  addiction: { id: "4", slug: "addiction", name_he: "התמכרויות ותלות" },
  trauma: { id: "5", slug: "trauma", name_he: "טראומה ומשברים" },
  life: { id: "6", slug: "life_transitions", name_he: "מעברי חיים והסתגלות" },
  self: { id: "7", slug: "self_identity", name_he: "דימוי עצמי וזהות" },
  grief: { id: "8", slug: "grief_loss", name_he: "אבל ואובדן" },
  family: { id: "9", slug: "family_parenting", name_he: "משפחה והורות" },
};

const ALIASES: [string, string[]][] = [
  [P.depression.id, ["דיכאון", "דיכאונות", "תסמיני דיכאון", "מצב דיכאוני", "אני בדיכאון"]],
  [P.anxiety.id, ["חרדה", "חרדות", "הפרעת חרדה", "הפרעות חרדה", "דאגנות יתר"]],
  [
    P.ocd.id,
    [
      "OCD",
      "הפרעה טורדנית כפייתית",
      "הפרעה אובססיבית קומפולסיבית",
      "מחשבות טורדניות",
      "מחשבות כפייתיות",
      "טורדנות כפייתית",
    ],
  ],
  [P.addiction.id, ["התמכרות", "התמכרויות", "התנהגות ממכרת"]],
  [
    P.trauma.id,
    [
      "טראומה",
      "PTSD",
      "פוסט טראומה",
      "הפרעה פוסט טראומטית",
      "אירוע טראומטי",
      "חוויות טראומטיות",
      "טראומה נפשית",
    ],
  ],
  [P.life.id, ["משבר חיים", "משברי חיים", "משברים בחיים", "משבר אישי", "משברים אישיים"]],
  [
    P.self.id,
    [
      "דימוי עצמי",
      "דימוי עצמי נמוך",
      "קשיים בדימוי העצמי",
      "ערך עצמי נמוך",
      "ביטחון עצמי נמוך",
      "חוסר ביטחון עצמי",
    ],
  ],
  // Legacy patient-voice single-token aliases retained in the database.
  [P.grief.id, ["אבל", "אובדן", "שכול", "אבל ושכול", "תהליך אבל", "אובדן אדם קרוב"]],
  [P.family.id, ["הדרכת הורים", "הדרכה הורית", "ייעוץ להורים", "ליווי הורים", "תמיכה הורית"]],
];

const catalog: FeedbackCatalog = {
  problems: Object.values(P),
  aliases: ALIASES.flatMap(([id, list]) => list.map((alias) => ({ problem_id: id, alias }))),
};

const slugsFor = (text: string, semantic: { slug: string; weight?: number }[] = []) =>
  combineFeedbackDomains(text, catalog, semantic).map((d) => d.slug);

/* ---------------- normalization + strict matcher ------------------------ */

describe("normalizeFeedbackText / latinSkeleton", () => {
  it("normalizes Latin abbreviation variants to the same skeleton", () => {
    for (const v of ["OCD", "OCD,", "O.C.D", "O.C.D.", "O C D", "o.c.d"]) {
      expect(latinSkeleton(v)).toBe("ocd");
    }
    for (const v of ["PTSD", "PTSD,", "P.T.S.D", "P.T.S.D.", "P T S D"]) {
      expect(latinSkeleton(v)).toBe("ptsd");
    }
  });

  it("strips punctuation, parentheses and diacritics", () => {
    expect(normalizeFeedbackText("(חֲרָדָה),")).toBe(normalizeFeedbackText("חרדה"));
    expect(normalizeFeedbackText("  דיכאון   ")).toBe(normalizeFeedbackText("דיכאון"));
  });
});

describe("phraseHasDirectEvidence", () => {
  it("matches Latin abbreviations in every punctuation variant", () => {
    for (const v of ["OCD", "OCD,", "O.C.D", "O.C.D.", "O C D", "o.c.d"]) {
      expect(phraseHasDirectEvidence("OCD", `מטפל ב${""}${v} ובחרדות`)).toBe(true);
    }
    for (const v of ["PTSD", "PTSD,", "P.T.S.D", "P.T.S.D.", "P T S D"]) {
      expect(phraseHasDirectEvidence("PTSD", `התמחות ב ${v} ובטראומה`)).toBe(true);
    }
  });

  it("matches joined and hyphenated Hebrew forms of פוסט טראומה", () => {
    for (const v of ["פוסט טראומה", "פוסט־טראומה", "פוסט-טראומה", "פוסטטראומה"]) {
      expect(phraseHasDirectEvidence("פוסט טראומה", `מטפל ב${v} אצל מבוגרים`)).toBe(true);
    }
  });

  it("matches punctuation-adjacent Hebrew terms", () => {
    expect(phraseHasDirectEvidence("חרדה", "מטפל בחרדה, ובדיכאון")).toBe(true);
    expect(phraseHasDirectEvidence("חרדות", "מטפל בחרדות, ועוד")).toBe(true);
    expect(phraseHasDirectEvidence("דיכאון", "מטפל בדיכאון, ועוד")).toBe(true);
    expect(phraseHasDirectEvidence("התמכרויות", "מטפל בהתמכרויות, ועוד")).toBe(true);
  });

  it("rejects unsafe single tokens and short aliases inside longer words", () => {
    expect(phraseHasDirectEvidence("אבל", "אני מטפל בחרדה אבל לא בדיכאון")).toBe(false);
    expect(phraseHasDirectEvidence("הורים", "עובד עם הורים")).toBe(false);
    expect(phraseHasDirectEvidence("כפייתיות", "התנהגויות כפייתיות")).toBe(false);
    // short alias must not match inside an unrelated longer word
    expect(phraseHasDirectEvidence("OCD", "socden ocdx")).toBe(false);
    expect(phraseHasDirectEvidence("טראומה", "פוסטטראומהxx")).toBe(false);
  });
});

describe("strict domain evidence rules", () => {
  it("אבל as a conjunction does not match grief_loss, but אבל ושכול does", () => {
    expect(slugsFor("אני מטפל בחרדה אבל לא בילדים קטנים בכלל")).not.toContain("grief_loss");
    expect(slugsFor("מטפלת באבל ושכול ובמשברי חיים")).toContain("grief_loss");
  });

  it("הורים alone does not match family_parenting, but הדרכת הורים does", () => {
    expect(slugsFor("אני עובד עם הורים וילדים בקליניקה שלי")).not.toContain("family_parenting");
    expect(slugsFor("אני עוסקת בהדרכת הורים בקליניקה שלי")).toContain("family_parenting");
  });

  it("כפייתיות alone does not match ocd_compulsions, but מחשבות כפייתיות does", () => {
    expect(slugsFor("אני מטפל בהתנהגויות כפייתיות שונות בכלל")).not.toContain("ocd_compulsions");
    expect(slugsFor("אני מטפל במחשבות כפייתיות ובחרדה כללית")).toContain("ocd_compulsions");
  });

  it("סיוטים alone does not match trauma, but PTSD does", () => {
    expect(slugsFor("אני מטפל בסיוטים ובקשיי שינה אצל מבוגרים")).not.toContain("trauma");
    expect(slugsFor("אני מטפל ב PTSD אצל מבוגרים ומתבגרים")).toContain("trauma");
  });

  it("עצמי alone does not create self_identity", () => {
    expect(slugsFor("אני מאמין בעבודה עם העולם הפנימי של האדם עצמי")).not.toContain(
      "self_identity",
    );
    expect(slugsFor("אני עוסקת בקשיים בדימוי העצמי אצל מתבגרות")).toContain("self_identity");
  });

  it("therapy methods CBT / ACT / MBSR / MBCT create no domains", () => {
    expect(slugsFor("אני משלב CBT, C.B.T, ACT, MBSR ו-MBCT בעבודתי הטיפולית עם מבוגרים")).toEqual(
      [],
    );
  });
});

/* ---------------- combination behavior ---------------------------------- */

const shuffle = <T>(arr: T[]): T[] => [...arr].reverse();

describe("combineFeedbackDomains", () => {
  const text = "מתמחה בטיפול בדיכאון, OCD, התמכרויות, הפרעות חרדה";

  it("keeps direct matches when extractProfile returns []", () => {
    expect(slugsFor(text, [])).toEqual(["depression", "ocd_compulsions", "addiction", "anxiety"]);
  });

  it("keeps direct matches when semantic results omit their slugs", () => {
    expect(slugsFor(text, [{ slug: "loneliness", weight: 9 }])).toContain("depression");
  });

  it("discards unknown and inactive semantic slugs, never returns ptsd", () => {
    const out = slugsFor("מטפל בפוסט טראומה (PTSD) ובחרדות", [
      { slug: "ptsd", weight: 10 },
      { slug: "not_a_slug", weight: 10 },
    ]);
    expect(out).not.toContain("ptsd");
    expect(out).not.toContain("not_a_slug");
    expect(out).toContain("trauma");
  });

  it("maps פוסט טראומה variants to the active trauma slug", () => {
    for (const v of ["PTSD", "פוסט טראומה", "פוסט־טראומה", "פוסטטראומה"]) {
      expect(slugsFor(`אני מטפל ב${v} אצל מבוגרים ומתבגרים`)).toEqual(["trauma"]);
    }
  });

  it("returns a slug found both directly and semantically only once", () => {
    const out = slugsFor(text, [{ slug: "depression", weight: 5 }]);
    expect(out.filter((s) => s === "depression")).toHaveLength(1);
  });

  it("orders direct matches by first textual occurrence", () => {
    const evidence = findDirectEvidence(text, catalog);
    expect(evidence.map((e) => e.slug)).toEqual([
      "depression",
      "ocd_compulsions",
      "addiction",
      "anxiety",
    ]);
    expect(evidence[0]!.firstMatchIndex).toBeLessThan(evidence[1]!.firstMatchIndex);
    expect(evidence[0]!.matchedPhrase).toBe("דיכאון");
  });

  it("places semantic-only results after direct matches", () => {
    // "אבל ושכול" appears later in the text but only semantically proposed.
    const t = "מטפל בדיכאון ובחרדה, ומלווה תהליכי אבל ושכול";
    const out = slugsFor(t, [{ slug: "grief_loss", weight: 3 }]);
    expect(out.indexOf("grief_loss")).toBeGreaterThan(out.indexOf("depression"));
  });

  it("is identical when problem rows are shuffled", () => {
    const shuffled: FeedbackCatalog = { ...catalog, problems: shuffle(catalog.problems) };
    expect(combineFeedbackDomains(text, shuffled, []).map((d) => d.slug)).toEqual(slugsFor(text));
  });

  it("is identical when alias rows are shuffled", () => {
    const shuffled: FeedbackCatalog = { ...catalog, aliases: shuffle(catalog.aliases) };
    expect(combineFeedbackDomains(text, shuffled, []).map((d) => d.slug)).toEqual(slugsFor(text));
  });

  it("uses weight desc then slug as a deterministic semantic tie-breaker", () => {
    expect(
      orderSemanticOnly([
        { slug: "trauma", weight: 1 },
        { slug: "anxiety", weight: 1 },
        { slug: "depression", weight: 5 },
      ]).map((e) => e.slug),
    ).toEqual(["depression", "anxiety", "trauma"]);
    // shuffled input, identical output
    expect(
      orderSemanticOnly([
        { slug: "anxiety", weight: 1 },
        { slug: "depression", weight: 5 },
        { slug: "trauma", weight: 1 },
      ]).map((e) => e.slug),
    ).toEqual(["depression", "anxiety", "trauma"]);
  });

  it("displays canonical name_he, never the alias", () => {
    const domains = combineFeedbackDomains("מטפל בדיכאון ובחרדות", catalog, []);
    expect(domains[0]).toEqual({ slug: "depression", name: "דיכאון וכאב רגשי" });
  });
});

/* ---------------- fixtures --------------------------------------------- */

const FIXTURE_1 = `פסיכולוג קליני מומחה, מטפל במבוגרים, ובמתבגרים.

מטפל בקליניקה בחופית ובקליניקה בקיבוץ מגל, וכן משמש כפסיכולוג של הבית המאזן בחדרה, מקבוצת רמות.

בעל ניסיון טיפולי רב עם מגוון גילאים, מצבים אישיים וקשיים רגשיים שונים. מתמחה בטיפול בדיכאון, OCD, התמכרויות, הפרעות חרדה, פוסט טראומה (PTSD), וכן בליווי טיפולי של אנשים המתמודדים עם מגוון רחב של קשיים ומשברים בחיים.

משלב כלים מעולם המיינדפולנס; מנחה מוסמך MBSR, ו-MBCT.

גישתי אינטגרטיבית, ומשלבת טיפול דינמי, המאפשר התבוננות מעמיקה בעולמו הפנימי של האדם ובמערכות יחסים משמעותיות עבורו, עם טיפול קוגניטיבי התנהגותי (CBT), על פי הצרכים שעולים במהלך הטיפול.

אני מאמין בטיפול פתוח ואקטיבי, על מנת לקדם תהליכים חווייתיים מעודדי שינוי, הקשורים בהיבטים רגשיים, קוגניטיביים, ובין-אישיים.`;

const FIXTURE_2 = `אני עובדת סוציאלית קלינית, עם התמחות בטראומה, ופסיכותרפיסטית בגישת C.B.T אינטגרטיבי. מטפלת בבני נוער ומשפחותיהם, במבוגרים ובבני הגיל השלישי בתחומים מגוונים כגון: חרדות, O.C.D, דיכאון, משברי חיים, פוסט טראומה, התמכרויות, קשיים בדימוי העצמי, הפרעות אישיות ומחלות נפש, אבל ושכול, הדרכת הורים, פגיעות מיניות ועוד.

אני בת 54, נשואה ואם לשניים.
מברכת על הבחירה לחיות במקום מגורים כפרי, המאפשר לי לשלב בחיי יציאות מרובות לטבע, ואת חיבתי העמוקה לבעלי חיים וסקרנותי ואהבתי לבני אדם.

אני מאמינה גדולה בקשר בין אנשים ובכוחו המרפא, וכן במציאת הכוחות המצויים בתוך כל אדם באשר הוא.

עם השנים למדתי שהחיבור הייחודי הנוצר בין המטפל למטופל, מזין את השינויים שיתרחשו ומהווה קרקע פוריה לתהליך אותו יעבור האדם.
מאמינה בכנות ובשקיפות ובעבודה בגובה העיניים בחדר הטיפול.

עבודתי מתאפיינת באינטגרציה בין גישות טיפול ובשימוש בו זמני בכלים מעולמות שונים כגון: מיינדפולנס, בודהיזם,CBT, ACT ועוד.`;

describe("profile editor fixtures", () => {
  it("uses exactly two queries and surfaces Supabase errors", async () => {
    const calls: string[] = [];
    const makeDb = (fail?: "problems" | "problem_aliases"): FeedbackDb => ({
      from(table) {
        calls.push(table);
        const res = {
          data: table === "problems" ? [{ id: 1, slug: "trauma", name_he: "טראומה ומשברים" }] : [],
          error: fail === table ? { message: "boom" } : null,
        };
        return {
          select: () => ({
            eq: async () => res,
            in: async () => res,
          }),
        };
      },
    });

    const loaded = await loadFeedbackCatalog(makeDb());
    expect(loaded.problems).toHaveLength(1);
    expect(calls).toEqual(["problems", "problem_aliases"]);

    await expect(loadFeedbackCatalog(makeDb("problems"))).rejects.toThrow("problems: boom");
    await expect(loadFeedbackCatalog(makeDb("problem_aliases"))).rejects.toThrow(
      "problem_aliases: boom",
    );
  });

  it("fixture 1 returns the expected slugs in order", () => {
    expect(slugsFor(FIXTURE_1, [{ slug: "ptsd", weight: 10 }])).toEqual([
      "depression",
      "ocd_compulsions",
      "addiction",
      "anxiety",
      "trauma",
      "life_transitions",
    ]);
  });

  it("fixture 2 returns the expected slugs in order and leaves deferred terms unmapped", () => {
    const out = slugsFor(FIXTURE_2, []);
    expect(out).toEqual([
      "trauma",
      "anxiety",
      "ocd_compulsions",
      "depression",
      "life_transitions",
      "addiction",
      "self_identity",
      "grief_loss",
      "family_parenting",
    ]);
    // more than eight domains are not truncated
    expect(out.length).toBeGreaterThan(8);
  });
});
