/**
 * Semantic Evaluation Corpus (Phase 17A).
 *
 * Dedicated home for all deterministic evaluation fixtures. This file only
 * OWNS DATA — never behavior. The runner lives in `./semantic-evaluation.ts`.
 *
 * Two families of cases live here:
 *
 *   1. Primitive-layer cases (Phase 10) — normalization / matching / profile
 *      similarity. These freeze the deterministic building blocks of the
 *      engine and must not be modified.
 *
 *   2. Higher-level cases (Phase 17A) — query classification and therapist
 *      profile extraction. These share a common shape so the runner can be
 *      extended with new evaluators (LLM shadow mode, embeddings, hybrid)
 *      without touching the runner itself.
 *
 * NOTE: No new cases are added in Phase 17A. The higher-level arrays are
 * intentionally empty and will be populated in a later phase.
 */

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export type EvaluationCategory =
  | "direct"
  | "natural_language"
  | "ambiguous"
  | "multiple_domains"
  | "slang"
  | "typos"
  | "therapist_profile"
  // Primitive-layer categories (reporting only).
  | "primitive_normalize"
  | "primitive_match"
  | "primitive_profile";

/* ------------------------------------------------------------------ */
/* Higher-level case shape (classification + profile extraction)       */
/* ------------------------------------------------------------------ */

/**
 * Canonical shape for classification / profile-extraction cases.
 * `expected` is the ordered set of slugs the evaluator should surface;
 * ordering / thresholding policy is decided by the runner adapter.
 */
export type SemanticCase = {
  input: string;
  expected: string[];
  category?: EvaluationCategory;
  description?: string;
  notes?: string;
  /** When true, results below the confidence threshold are accepted. */
  allowLowConfidence?: boolean;
};

/**
 * Query-classification corpus. Grows in later phases.
 */
export const CLASSIFICATION_CASES: SemanticCase[] = [
  /* ---------------- direct (baseline control) ---------------- */
  { input: "חרדה", expected: ["anxiety"], category: "direct", description: "single-word anxiety" },
  { input: "דיכאון", expected: ["depression"], category: "direct" },
  { input: "התקפי פאניקה", expected: ["anxiety"], category: "direct" },
  { input: "פוסט טראומה", expected: ["trauma"], category: "direct" },
  { input: "שחיקה", expected: ["burnout"], category: "direct" },
  { input: "OCD", expected: ["ocd_compulsions"], category: "direct" },
  { input: "חרדה חברתית", expected: ["anxiety"], category: "direct" },
  { input: "בעיות זוגיות", expected: ["relationships"], category: "direct" },
  { input: "משבר בזוגיות", expected: ["relationships"], category: "direct" },
  { input: "דימוי עצמי נמוך", expected: ["self_identity"], category: "direct" },
  { input: "טראומה", expected: ["trauma"], category: "direct" },
  { input: "כעס", expected: ["emotional_regulation"], category: "direct" },
  { input: "בדידות", expected: ["social_belonging"], category: "direct" },
  { input: "אבל", expected: ["grief_loss"], category: "direct" },
  { input: "גירושין", expected: ["relationships"], category: "direct" },

  /* ---------------- natural_language (spoken style) ---------------- */
  {
    input: "אני מרגיש שאני לא מצליח לישון בלילות מרוב מחשבות",
    expected: ["anxiety"],
    category: "natural_language",
  },
  {
    input: "כבר תקופה שאני לא מוצא עניין בכלום",
    expected: ["depression"],
    category: "natural_language",
  },
  {
    input: "אני פוחדת לצאת מהבית ולפגוש אנשים",
    expected: ["anxiety"],
    category: "natural_language",
  },
  {
    input: "יש לי התקפי חרדה באמצע היום בלי סיבה",
    expected: ["anxiety"],
    category: "natural_language",
  },
  {
    input: "אחרי השירות הצבאי אני חווה פלאשבקים וסיוטים",
    expected: ["trauma"],
    category: "natural_language",
  },
  {
    input: "אני שחוקה לגמרי מהעבודה ולא מצליחה להתאושש",
    expected: ["burnout"],
    category: "natural_language",
  },
  {
    input: "אני לא מסתדרת עם בן הזוג שלי כבר חודשים",
    expected: ["relationships"],
    category: "natural_language",
  },
  {
    input: "אבא שלי נפטר לפני שנה ואני עדיין לא מתגברת",
    expected: ["grief_loss"],
    category: "natural_language",
  },
  {
    input: "אני כל הזמן בודקת אם נעלתי את הדלת ושכבתי את הגז",
    expected: ["ocd_compulsions"],
    category: "natural_language",
  },
  {
    input: "אני מרגיש בודד גם כשאני עם אנשים",
    expected: ["social_belonging"],
    category: "natural_language",
  },
  {
    input: "יש לי בעיה עם אוכל, אני אוכלת ואז מתחרטת",
    expected: ["eating_disorders"],
    category: "natural_language",
  },
  {
    input: "לא מצליח להיות אינטימי עם בת הזוג שלי",
    expected: ["sexuality_intimacy"],
    category: "natural_language",
    allowLowConfidence: true,
  },
  {
    input: "אני כועס על כולם כל הזמן ולא מבין למה",
    expected: ["emotional_regulation"],
    category: "natural_language",
  },
  {
    input: "עוברת גירושין ומרגישה שהעולם מתפרק",
    expected: ["relationships"],
    category: "natural_language",
  },
  {
    input: "אני דוחה כל דבר לרגע האחרון ואז זה מתפוצץ לי",
    expected: ["performance_functioning"],
    category: "natural_language",
  },
  {
    input: "מרגיש שאין לי ערך ושכולם טובים ממני",
    expected: ["self_identity"],
    category: "natural_language",
  },
  {
    input: "אני מפחדת שיש לי מחלה קשה ורצה כל הזמן לרופאים",
    expected: ["anxiety"],
    category: "natural_language",
  },
  {
    input: "אני חושבת כל הזמן על המשקל שלי ואיך אני נראית",
    expected: ["body_image"],
    category: "natural_language",
    allowLowConfidence: true,
  },
  {
    input: "אחרי הפרידה אני לא מצליח לחזור לעצמי",
    expected: ["relationships"],
    category: "natural_language",
  },
  {
    input: "אני מתקשה להורות ולא יודעת איך להתמודד עם הילדים שלי",
    expected: ["family_parenting"],
    category: "natural_language",
  },
  {
    input: "אני מרגישה שאני עומדת להתפרק ולא יכולה יותר",
    expected: ["emotional_regulation"],
    category: "natural_language",
    allowLowConfidence: true,
  },
  {
    input: "יש לי פחד אימים מטיסות ואני נמנעת מזה",
    expected: ["anxiety"],
    category: "natural_language",
  },
  {
    input: "עברתי הטרדה מינית ואני לא מצליחה לתפקד מאז",
    expected: ["trauma"],
    category: "natural_language",
  },
  {
    input: "אני מכור לפורנו ולא מצליח להפסיק",
    expected: ["addiction"],
    category: "natural_language",
    allowLowConfidence: true,
  },
  {
    input: "אני שותה יותר מדי ואני יודע שזה בעיה",
    expected: ["substance_use"],
    category: "natural_language",
    allowLowConfidence: true,
  },

  /* ---------------- ambiguous ---------------- */
  {
    input: "אני מרגיש רע",
    expected: ["depression"],
    category: "ambiguous",
    allowLowConfidence: true,
    notes: "very generic emotional state",
  },
  { input: "משהו לא בסדר איתי", expected: [], category: "ambiguous", allowLowConfidence: true },
  {
    input: "אני צריך לדבר עם מישהו",
    expected: [],
    category: "ambiguous",
    allowLowConfidence: true,
  },
  {
    input: "החיים שלי תקועים",
    expected: ["life_transitions"],
    category: "ambiguous",
    allowLowConfidence: true,
  },
  {
    input: "אני לא יודעת מה אני רוצה מהחיים",
    expected: ["self_identity"],
    category: "ambiguous",
    allowLowConfidence: true,
  },
  {
    input: "אני עייף כל הזמן",
    expected: ["burnout"],
    category: "ambiguous",
    allowLowConfidence: true,
  },
  {
    input: "יש לי כאבים בגוף בלי סיבה",
    expected: ["somatic"],
    category: "ambiguous",
    allowLowConfidence: true,
  },
  {
    input: "אני מרגיש ריק",
    expected: ["depression"],
    category: "ambiguous",
    allowLowConfidence: true,
  },
  {
    input: "אני לא מבינה את עצמי",
    expected: ["self_identity"],
    category: "ambiguous",
    allowLowConfidence: true,
  },
  { input: "משהו בי שבור", expected: [], category: "ambiguous", allowLowConfidence: true },
  { input: "אני צריכה עזרה", expected: [], category: "ambiguous", allowLowConfidence: true },
  {
    input: "משבר",
    expected: [],
    category: "ambiguous",
    allowLowConfidence: true,
    notes: "generic crisis wording is contextual, not a canonical domain",
  },

  /* ---------------- multiple_domains ---------------- */
  {
    input: "אני בלחץ מהעבודה וגם הזוגיות שלי לא טובה",
    expected: ["burnout", "relationships"],
    category: "multiple_domains",
  },
  { input: "אני לא ישן טוב ואני מרגיש חרדה", expected: ["anxiety"], category: "multiple_domains" },
  {
    input: "יש לי פחד מטיסה וגם בעיות בביטחון עצמי",
    expected: ["anxiety", "self_identity"],
    category: "multiple_domains",
  },
  {
    input: "דיכאון וחרדה שמלווים אותי מזה שנים",
    expected: ["depression", "anxiety"],
    category: "multiple_domains",
  },
  {
    input: "אחרי טראומה מהצבא יש לי גם התקפי פאניקה",
    expected: ["trauma", "anxiety"],
    category: "multiple_domains",
  },
  {
    input: "אני שותה יותר מדי בגלל הדיכאון",
    expected: ["substance_use", "depression"],
    category: "multiple_domains",
    allowLowConfidence: true,
  },
  {
    input: "בעיות אכילה על רקע דימוי גוף נמוך",
    expected: ["eating_disorders", "body_image"],
    category: "multiple_domains",
    allowLowConfidence: true,
  },
  {
    input: "אני כועסת על בן הזוג שלי ומתפרצת על הילדים",
    expected: ["relationships", "family_parenting"],
    category: "multiple_domains",
  },
  {
    input: "עברתי גירושין ומאז אני בדיכאון עמוק",
    expected: ["relationships", "depression"],
    category: "multiple_domains",
  },
  {
    input: "אבל על אמא שנפטרה ובדידות קשה",
    expected: ["grief_loss", "social_belonging"],
    category: "multiple_domains",
  },
  {
    input: "OCD וחרדה שמשתקים אותי בעבודה",
    expected: ["ocd_compulsions", "anxiety"],
    category: "multiple_domains",
  },
  {
    input: "בעיות אינטימיות בזוגיות ופחד מקרבה",
    expected: ["sexuality_intimacy", "relationships"],
    category: "multiple_domains",
    allowLowConfidence: true,
  },
  {
    input: "שחיקה בעבודה ומחשבות אובדניות",
    expected: ["burnout", "depression"],
    category: "multiple_domains",
    allowLowConfidence: true,
  },
  {
    input: "התמכרות לסמים אחרי טראומה בילדות",
    expected: ["addiction", "trauma"],
    category: "multiple_domains",
  },
  {
    input: "בעיות זוגיות אחרי בגידה, אני לא מצליחה לסמוך יותר",
    expected: ["relationships"],
    category: "multiple_domains",
    allowLowConfidence: true,
  },

  /* ---------------- slang / conversational ---------------- */
  {
    input: "אני אוכל סרטים",
    expected: ["anxiety"],
    category: "slang",
    notes: "Hebrew slang for panic/overthinking",
    allowLowConfidence: true,
  },
  { input: "אני גמור נפשית", expected: ["burnout"], category: "slang", allowLowConfidence: true },
  { input: "אני בלחץ רצח", expected: ["anxiety"], category: "slang", allowLowConfidence: true },
  {
    input: "אין לי אוויר כבר",
    expected: ["emotional_regulation"],
    category: "slang",
    allowLowConfidence: true,
  },
  { input: "אני על הפנים", expected: ["depression"], category: "slang", allowLowConfidence: true },
  {
    input: "אני בדאון רציני",
    expected: ["depression"],
    category: "slang",
    allowLowConfidence: true,
  },
  {
    input: "אני מתפרק לחתיכות",
    expected: ["emotional_regulation"],
    category: "slang",
    allowLowConfidence: true,
  },
  {
    input: "המוח שלי לא נותן לי מנוח",
    expected: ["ocd_compulsions"],
    category: "slang",
    allowLowConfidence: true,
  },
  {
    input: "אני לא סובלת את עצמי",
    expected: ["self_identity"],
    category: "slang",
    allowLowConfidence: true,
  },
  {
    input: "עולה לי הלחץ בגלל הכל",
    expected: ["anxiety"],
    category: "slang",
    allowLowConfidence: true,
  },
  { input: "אני שרוף לגמרי", expected: ["burnout"], category: "slang", allowLowConfidence: true },
  { input: "אני מתחרפנת", expected: ["anxiety"], category: "slang", allowLowConfidence: true },
  {
    input: "אין לי כוח לכלום",
    expected: ["depression"],
    category: "slang",
    allowLowConfidence: true,
  },
  {
    input: "אני מרגישה שאני משתגעת",
    expected: ["anxiety"],
    category: "slang",
    allowLowConfidence: true,
  },
  { input: "אני בקטע של חרדות כל הזמן", expected: ["anxiety"], category: "slang" },

  /* ---------------- typos / noisy input ---------------- */
  {
    input: "אנכיי בלחץ",
    expected: ["anxiety"],
    category: "typos",
    allowLowConfidence: true,
    notes: "swapped letters in אני",
  },
  { input: "דכאוווון", expected: ["depression"], category: "typos", allowLowConfidence: true },
  {
    input: "fear of flyng",
    expected: ["anxiety"],
    category: "typos",
    allowLowConfidence: true,
    notes: "English typo",
  },
  { input: "חררדה חחברתית", expected: ["anxiety"], category: "typos", allowLowConfidence: true },
  { input: "התקפפפי פאניקה", expected: ["anxiety"], category: "typos" },
  {
    input: "PTSD אחרי טראמה",
    expected: ["trauma"],
    category: "typos",
    allowLowConfidence: true,
    notes: "missing letter in טראומה",
  },
  {
    input: "ocd קש מאד",
    expected: ["ocd_compulsions"],
    category: "typos",
    allowLowConfidence: true,
  },
  { input: "שחיקהה בעבודהה!!!", expected: ["burnout"], category: "typos" },
  { input: "דיכאון??? חרדה???", expected: ["depression", "anxiety"], category: "typos" },
  { input: "אני בלחצץץ", expected: ["anxiety"], category: "typos", allowLowConfidence: true },
  {
    input: "בעיות זוגייות",
    expected: ["relationships"],
    category: "typos",
    allowLowConfidence: true,
  },
  { input: "דימוי עצמיי נמוך מאד", expected: ["self_identity"], category: "typos" },
];

/* ------------------------------------------------------------------ */
/* Profile extraction corpus (Phase 17B).                              */
/*                                                                     */
/* Each `input` is a therapist FULL_DESCRIPTION. `expected` is the set  */
/* of semantic_profile slugs SemanticEngine.extractProfile() should     */
/* surface. Default expectation mode is "subset" — the engine may       */
/* return additional related slugs beyond the required set.             */
/* ------------------------------------------------------------------ */

/**
 * Therapist profile-extraction corpus. Each `input` is a FULL_DESCRIPTION
 * that the engine's `extractProfile()` should reduce to the expected slug
 * set. Grows in later phases.
 */
export const PROFILE_EXTRACTION_CASES: SemanticCase[] = [
  {
    input: "מטפלת בגישה קוגניטיבית התנהגותית עם ניסיון בטיפול בחרדה חברתית ודיכאון קליני",
    expected: ["anxiety", "depression"],
    category: "therapist_profile",
    description: "CBT — social anxiety + depression",
  },
  {
    input: "פסיכולוג קליני מומחה בטיפול בפוסט טראומה וטראומה מורכבת אצל יוצאי צבא",
    expected: ["trauma"],
    category: "therapist_profile",
    description: "trauma specialist — PTSD + complex trauma",
  },
  {
    input: "מטפלת בהתקפי פאניקה, חרדה כללית והפרעת OCD במבוגרים",
    expected: ["anxiety", "ocd_compulsions"],
    category: "therapist_profile",
    description: "anxiety-cluster specialist",
  },
  {
    input: "עובד סוציאלי קליני, מלווה מטופלים בדיכאון, שחיקה ומצבי רוח ירודים",
    expected: ["depression", "burnout"],
    category: "therapist_profile",
  },
  {
    input: "מטפלת זוגית ומשפחתית, מתמחה במשברים בזוגיות, בגידות וקונפליקטים בין הורים לילדים",
    expected: ["relationships", "family_parenting"],
    category: "therapist_profile",
  },
  {
    input: "פסיכותרפיסטית דינמית, עובדת עם מטופלים סביב חרדה, דימוי עצמי נמוך וקשיים במערכות יחסים",
    expected: ["anxiety", "self_identity", "relationships"],
    category: "therapist_profile",
    description: "mixed-domain — anxiety + self-esteem + relationships",
  },
  {
    input: "מומחית בהפרעות אכילה, אכילה בולמוסית ודימוי גוף אצל נשים צעירות",
    expected: ["eating_disorders", "body_image"],
    category: "therapist_profile",
  },
  {
    input: "מטפל בגישת EMDR לטראומה, פוסט טראומה וטראומת ילדות",
    expected: ["trauma"],
    category: "therapist_profile",
  },
  {
    input: "פסיכולוגית התפתחותית העובדת עם ילדים ונוער סביב ADHD, אוטיזם וקשיי התפתחות",
    expected: ["adhd", "autism", "childhood_development"],
    category: "therapist_profile",
  },
  {
    input: "מטפלת CBT להפרעות חרדה, פוביות, חרדת ביצוע וחרדת בריאות",
    expected: ["anxiety"],
    category: "therapist_profile",
  },
  {
    input: "מלווה מטופלים בתהליכי אבל, אובדן ושכול לאחר מות בן משפחה",
    expected: ["grief_loss"],
    category: "therapist_profile",
  },
  {
    input: "פסיכולוג המתמחה בהתמכרויות — אלכוהול, סמים והתמכרויות התנהגותיות",
    expected: ["addiction", "substance_use", "behavioral_addiction"],
    category: "therapist_profile",
  },
  {
    input: "מטפלת בנושאי זהות מינית, קשיים מיניים ואינטימיות בזוגיות",
    expected: ["sexuality_intimacy"],
    category: "therapist_profile",
  },
  {
    input: "מטפלת גוף-נפש בגישה סומטית לחרדה, טראומה וסימפטומים פסיכוסומטיים",
    expected: ["somatic", "anxiety", "trauma"],
    category: "therapist_profile",
  },
  {
    input: "יועצת הורית לקשיי הורות, קונפליקטים עם ילדים ושחיקת הורות",
    expected: ["family_parenting"],
    category: "therapist_profile",
  },
  {
    input: "מטפלת בגישה אקזיסטנציאלית, בשאלות של משמעות, זהות ומעברי חיים",
    expected: ["existential", "self_identity", "life_transitions"],
    category: "therapist_profile",
    description: "vague — inference-heavy",
  },
  {
    input: "פסיכולוג ארגוני העוזר למטופלים סביב שחיקה, שינוי קריירה ודחיינות",
    expected: ["burnout", "career_direction", "performance_functioning"],
    category: "therapist_profile",
  },
  {
    input: "מטפלת בגישה יונגיאנית העוסקת בבדידות, משבר זהות ומשברי אמצע החיים",
    expected: ["social_belonging", "self_identity", "life_transitions"],
    category: "therapist_profile",
    description: "vague inference — loneliness + identity",
  },
];

/**
 * Convenience grouping so runners can iterate every higher-level corpus.
 */
export const ALL_HIGHER_LEVEL_CORPUSES: ReadonlyArray<{
  kind: "classify" | "extract-profile";
  cases: readonly SemanticCase[];
}> = [
  { kind: "classify", cases: CLASSIFICATION_CASES },
  { kind: "extract-profile", cases: PROFILE_EXTRACTION_CASES },
];

/* ------------------------------------------------------------------ */
/* Primitive-layer fixtures (Phase 10 — do not modify)                 */
/* ------------------------------------------------------------------ */

export type NormalizationCase = {
  name: string;
  input: string;
  expected: string;
  category?: EvaluationCategory;
};

export type MatchCase = {
  name: string;
  phrase: string;
  haystack: string;
  expected: boolean;
  category?: EvaluationCategory;
};

export type ProfileMatchCase = {
  name: string;
  userProfile: Array<{ slug: string; confidence: number }>;
  therapistProfile: unknown;
  /** Expected similarity, matched with a small tolerance. */
  expected: number;
  category?: EvaluationCategory;
};

export const NORMALIZATION_CASES: NormalizationCase[] = [
  { name: "strip nikud", input: "חֲרָדָה", expected: "חרד" },
  { name: "collapse whitespace", input: "  חרדה    חברתית ", expected: "חרד חברתי" },
  { name: "collapse repeated !", input: "עזרה!!!!", expected: "עזר" },
  { name: "collapse letter runs", input: "לחוץץץץ", expected: "לחוץ" },
  { name: "fem plural fold", input: "התקפות חרדה", expected: "התקפ חרד" },
  { name: "masc plural fold", input: "לחצים בעבודה", expected: "לחצ בעבוד" },
  { name: "lowercase latin", input: "PTSD קשה", expected: "ptsd קש" },
  { name: "empty", input: "", expected: "" },
];

export const MATCH_CASES: MatchCase[] = [
  { name: "direct alias", phrase: "חרדה", haystack: "יש לי חרדה חברתית", expected: true },
  { name: "prefix stripping", phrase: "חרדה", haystack: "בחרדה גדולה", expected: true },
  { name: "plural variant", phrase: "התקף חרדה", haystack: "התקפי חרדה", expected: true },
  { name: "paraphrase root", phrase: "לחץ", haystack: "אני לחוץ בעבודה", expected: true },
  { name: "no overlap", phrase: "חרדה", haystack: "כאבי גב", expected: false },
  { name: "stopword only", phrase: "אני", haystack: "אני עצוב", expected: false },
  { name: "case-insensitive latin", phrase: "PTSD", haystack: "ptsd אחרי צבא", expected: true },
  { name: "empty phrase", phrase: "", haystack: "משהו", expected: false },
];

export const PROFILE_CASES: ProfileMatchCase[] = [
  {
    name: "perfect overlap",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "anxiety", weight: 1 }],
    expected: 1,
  },
  {
    name: "no overlap",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "couples", weight: 1 }],
    expected: 0,
  },
  {
    name: "partial weight",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "anxiety", weight: 0.5 }],
    expected: 0.5,
  },
  {
    name: "legacy string profile normalised to weight 1",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: ["anxiety"],
    expected: 1,
  },
  {
    name: "empty therapist profile",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [],
    expected: 0,
  },
  {
    name: "empty user profile",
    userProfile: [],
    therapistProfile: [{ slug: "anxiety", weight: 1 }],
    expected: 0,
  },
  {
    name: "confidence-weighted average",
    userProfile: [
      { slug: "anxiety", confidence: 0.8 },
      { slug: "depression", confidence: 0.2 },
    ],
    therapistProfile: [{ slug: "anxiety", weight: 1 }],
    expected: 0.8,
  },
  {
    name: "malformed entries ignored",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "anxiety", weight: 1 }, { foo: "bar" }, null],
    expected: 1,
  },
  {
    name: "weight clamped default when out of range",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "anxiety", weight: 999 }],
    expected: 1, // out-of-range → default 1.0
  },
];
