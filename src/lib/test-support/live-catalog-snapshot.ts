/**
 * Phase 4 — read-only snapshot of the LIVE active treatment-domain catalog
 * (`problems` where is_active + their `problem_aliases`), exported on
 * 2026-08-07 after the Phase 3 migration 20260806082039 was applied.
 *
 * Test-support data only. Generated from the database, never hand-edited:
 * it lets the Phase 4 end-to-end suite drive the REAL production extraction
 * path (loadFeedbackCatalog / findDirectEvidence / combineFeedbackDomains)
 * deterministically, with no network access.
 *
 * Live counts at export time: 68 problems, 21 active, 397 aliases
 * (231 on active problems).
 */
import type { FeedbackCatalog } from "../profile-domain-feedback";

export const LIVE_ACTIVE_CATALOG: FeedbackCatalog = {
  problems: [
    {
      id: "10",
      slug: "addiction",
      name_he: "התמכרויות ותלות",
    },
    {
      id: "1",
      slug: "anxiety",
      name_he: "חרדה ופחדים",
    },
    {
      id: "16",
      slug: "communication_expression",
      name_he: "תקשורת וביטוי",
    },
    {
      id: "2",
      slug: "depression",
      name_he: "דיכאון וכאב רגשי",
    },
    {
      id: "17",
      slug: "developmental",
      name_he: "התפתחות ואתגרי ילדות",
    },
    {
      id: "11",
      slug: "eating_body",
      name_he: "אכילה ודימוי גוף",
    },
    {
      id: "8",
      slug: "emotional_regulation",
      name_he: "ויסות רגשי",
    },
    {
      id: "20",
      slug: "existential",
      name_he: "שאלות קיום ומשמעות",
    },
    {
      id: "5",
      slug: "family_parenting",
      name_he: "משפחה והורות",
    },
    {
      id: "13",
      slug: "grief_loss",
      name_he: "אבל ואובדן",
    },
    {
      id: "14",
      slug: "life_transitions",
      name_he: "מעברי חיים והסתגלות",
    },
    {
      id: "18",
      slug: "neurodiversity",
      name_he: "נוירודיברסיות ואתגרים קוגניטיביים",
    },
    {
      id: "9",
      slug: "ocd_compulsions",
      name_he: "OCD והתנהגויות כפייתיות",
    },
    {
      id: "15",
      slug: "performance_functioning",
      name_he: "עבודה, לימודים ותפקוד",
    },
    {
      id: "67",
      slug: "personality_disorders",
      name_he: "הפרעות אישיות",
    },
    {
      id: "4",
      slug: "relationships",
      name_he: "זוגיות והיקשרות",
    },
    {
      id: "7",
      slug: "self_identity",
      name_he: "דימוי עצמי וזהות",
    },
    {
      id: "68",
      slug: "sexual_abuse_trauma",
      name_he: "פגיעות מיניות וטראומה מינית",
    },
    {
      id: "6",
      slug: "social_belonging",
      name_he: "בדידות ושייכות",
    },
    {
      id: "19",
      slug: "somatic",
      name_he: "גוף-נפש וסימפטומים גופניים",
    },
    {
      id: "3",
      slug: "trauma",
      name_he: "טראומה ומשברים",
    },
  ],
  aliases: [
    {
      problem_id: "1",
      alias: "אוכל סרטים",
    },
    {
      problem_id: "1",
      alias: "אני overthinking",
    },
    {
      problem_id: "1",
      alias: "אני אוכל סרטים",
    },
    {
      problem_id: "1",
      alias: "אני בלחץ",
    },
    {
      problem_id: "1",
      alias: "אני בלחץ רצח",
    },
    {
      problem_id: "1",
      alias: "אני חרד",
    },
    {
      problem_id: "1",
      alias: "אני לא מצליח להירגע",
    },
    {
      problem_id: "1",
      alias: "אני לא רגוע",
    },
    {
      problem_id: "1",
      alias: "אני מפחד כל הזמן",
    },
    {
      problem_id: "1",
      alias: "אני משתגע",
    },
    {
      problem_id: "1",
      alias: "אני משתגעת",
    },
    {
      problem_id: "1",
      alias: "אני מתחרפן",
    },
    {
      problem_id: "1",
      alias: "אני מתחרפנת",
    },
    {
      problem_id: "1",
      alias: "אני נמנע מדברים בגלל פחד",
    },
    {
      problem_id: "1",
      alias: "דאגנות יתר",
    },
    {
      problem_id: "1",
      alias: "הפרעות חרדה",
    },
    {
      problem_id: "1",
      alias: "הפרעת חרדה",
    },
    {
      problem_id: "1",
      alias: "הפרעת חרדה מוכללת",
    },
    {
      problem_id: "1",
      alias: "התקף פאניקה",
    },
    {
      problem_id: "1",
      alias: "התקפי פאניקה",
    },
    {
      problem_id: "1",
      alias: "חרדה",
    },
    {
      problem_id: "1",
      alias: "חרדה חברתית",
    },
    {
      problem_id: "1",
      alias: "חרדה מוכללת",
    },
    {
      problem_id: "1",
      alias: "חרדות",
    },
    {
      problem_id: "1",
      alias: "חרדת בריאות",
    },
    {
      problem_id: "1",
      alias: "יש לי סטרס",
    },
    {
      problem_id: "1",
      alias: "לחץ רצח",
    },
    {
      problem_id: "1",
      alias: "משתגעת מהמחשבות",
    },
    {
      problem_id: "1",
      alias: "מתחרפן",
    },
    {
      problem_id: "1",
      alias: "מתחרפנת",
    },
    {
      problem_id: "1",
      alias: "עולה לי הלחץ",
    },
    {
      problem_id: "1",
      alias: "פוביה",
    },
    {
      problem_id: "1",
      alias: "פוביות",
    },
    {
      problem_id: "1",
      alias: "קשה לי לישון מהמחשבות",
    },
    {
      problem_id: "10",
      alias: "אני חוזר לאותו דפוס שוב ושוב",
    },
    {
      problem_id: "10",
      alias: "אני לא מצליח להפסיק הרגלים רעים",
    },
    {
      problem_id: "10",
      alias: "אני תלוי במשהו",
    },
    {
      problem_id: "10",
      alias: "התמכרויות",
    },
    {
      problem_id: "10",
      alias: "התמכרות",
    },
    {
      problem_id: "10",
      alias: "התנהגות ממכרת",
    },
    {
      problem_id: "10",
      alias: "יש לי התמכרות",
    },
    {
      problem_id: "10",
      alias: "קשה לי לשלוט בשימוש",
    },
    {
      problem_id: "11",
      alias: "אכילה רגשית",
    },
    {
      problem_id: "11",
      alias: "אנורקסיה",
    },
    {
      problem_id: "11",
      alias: "אני אוכל יותר מדי או פחות מדי",
    },
    {
      problem_id: "11",
      alias: "אני לא מרוצה מהגוף שלי",
    },
    {
      problem_id: "11",
      alias: "אני עסוק במשקל שלי",
    },
    {
      problem_id: "11",
      alias: "בולימיה",
    },
    {
      problem_id: "11",
      alias: "דימוי גוף",
    },
    {
      problem_id: "11",
      alias: "דימוי גוף שלילי",
    },
    {
      problem_id: "11",
      alias: "הפרעות אכילה",
    },
    {
      problem_id: "11",
      alias: "הפרעת אכילה",
    },
    {
      problem_id: "11",
      alias: "יש לי בעיות עם אוכל",
    },
    {
      problem_id: "11",
      alias: "קשה לי עם דימוי גוף",
    },
    {
      problem_id: "11",
      alias: "קשיים בדימוי הגוף",
    },
    {
      problem_id: "13",
      alias: "אבא שלי נפטר",
    },
    {
      problem_id: "13",
      alias: "אבל ושכול",
    },
    {
      problem_id: "13",
      alias: "אובדן אדם קרוב",
    },
    {
      problem_id: "13",
      alias: "איבדתי מישהו קרוב",
    },
    {
      problem_id: "13",
      alias: "אמא שלי נפטרה",
    },
    {
      problem_id: "13",
      alias: "אני לא מצליח לשחרר את העבר",
    },
    {
      problem_id: "13",
      alias: "אני מתאבל",
    },
    {
      problem_id: "13",
      alias: "אני מתאבלת",
    },
    {
      problem_id: "13",
      alias: "אני מתמודד עם אובדן",
    },
    {
      problem_id: "13",
      alias: "התאבלות",
    },
    {
      problem_id: "13",
      alias: "התמודדות עם אבל",
    },
    {
      problem_id: "13",
      alias: "התמודדות עם אובדן",
    },
    {
      problem_id: "13",
      alias: "משהו בי נשבר מאז שאיבדתי מישהו",
    },
    {
      problem_id: "13",
      alias: "קשה לי אחרי המוות",
    },
    {
      problem_id: "13",
      alias: "קשה לי להתגבר על פרידה קשה",
    },
    {
      problem_id: "13",
      alias: "תהליך אבל",
    },
    {
      problem_id: "14",
      alias: "אני בין שלבים בחיים ולא יציב",
    },
    {
      problem_id: "14",
      alias: "אני בתקופה של שינוי גדול",
    },
    {
      problem_id: "14",
      alias: "אני לא מוצא את עצמי אחרי מעבר",
    },
    {
      problem_id: "14",
      alias: "החיים שלי תקועים",
    },
    {
      problem_id: "14",
      alias: "לא יודע לאן ללכת",
    },
    {
      problem_id: "14",
      alias: "מעבר בחיים",
    },
    {
      problem_id: "14",
      alias: "משבר אישי",
    },
    {
      problem_id: "14",
      alias: "משבר חיים",
    },
    {
      problem_id: "14",
      alias: "משברי חיים",
    },
    {
      problem_id: "14",
      alias: "משברים אישיים",
    },
    {
      problem_id: "14",
      alias: "משברים בחיים",
    },
    {
      problem_id: "14",
      alias: "נקודת מפנה",
    },
    {
      problem_id: "14",
      alias: "עברתי שינוי בחיים ואני לא מסתדר",
    },
    {
      problem_id: "14",
      alias: "קשה לי להסתגל למצב חדש",
    },
    {
      problem_id: "14",
      alias: "שינוי גדול בחיים",
    },
    {
      problem_id: "14",
      alias: "שינוי משמעותי",
    },
    {
      problem_id: "15",
      alias: "דחיינות",
    },
    {
      problem_id: "15",
      alias: "קושי בתפקוד",
    },
    {
      problem_id: "15",
      alias: "קשיים בתפקוד",
    },
    {
      problem_id: "15",
      alias: "שחיקה בעבודה",
    },
    {
      problem_id: "15",
      alias: "שחיקה מקצועית",
    },
    {
      problem_id: "15",
      alias: "תחושת שחיקה",
    },
    {
      problem_id: "17",
      alias: "אני מרגיש תקוע מאז הילדות",
    },
    {
      problem_id: "17",
      alias: "אני תקוע רגשית מהעבר",
    },
    {
      problem_id: "17",
      alias: "התפתחות רגשית לא פשוטה",
    },
    {
      problem_id: "17",
      alias: "יש לי דפוסים ישנים שקשה לשנות",
    },
    {
      problem_id: "17",
      alias: "יש לי דפוסים מהילדות",
    },
    {
      problem_id: "17",
      alias: "יש לי קושי רגשי ישן",
    },
    {
      problem_id: "17",
      alias: "משהו בי לא התפתח כמו שצריך",
    },
    {
      problem_id: "17",
      alias: "עברתי דברים בילדות שמשפיעים עליי",
    },
    {
      problem_id: "17",
      alias: "קשיים מהילדות",
    },
    {
      problem_id: "17",
      alias: "קשיים רגשיים מהעבר",
    },
    {
      problem_id: "18",
      alias: "ADHD",
    },
    {
      problem_id: "18",
      alias: "אוטיזם",
    },
    {
      problem_id: "18",
      alias: "הספקטרום האוטיסטי",
    },
    {
      problem_id: "18",
      alias: "הפרעת קשב וריכוז",
    },
    {
      problem_id: "18",
      alias: "יש לי ADHD",
    },
    {
      problem_id: "18",
      alias: "יש לי ADHD או חשד לזה",
    },
    {
      problem_id: "18",
      alias: "ספקטרום אוטיסטי",
    },
    {
      problem_id: "18",
      alias: "קשיי קשב וריכוז",
    },
    {
      problem_id: "2",
      alias: "אין לי חשק",
    },
    {
      problem_id: "2",
      alias: "אין לי חשק לכלום",
    },
    {
      problem_id: "2",
      alias: "אין לי כוח לכלום",
    },
    {
      problem_id: "2",
      alias: "אני בדיכאון",
    },
    {
      problem_id: "2",
      alias: "אני לא נהנה מכלום",
    },
    {
      problem_id: "2",
      alias: "אני מרגיש כבוי",
    },
    {
      problem_id: "2",
      alias: "אני מרגיש ריק",
    },
    {
      problem_id: "2",
      alias: "אני עייף נפשית כל הזמן",
    },
    {
      problem_id: "2",
      alias: "אני על הפנים",
    },
    {
      problem_id: "2",
      alias: "דיכאון",
    },
    {
      problem_id: "2",
      alias: "דיכאונות",
    },
    {
      problem_id: "2",
      alias: "הכול אפור",
    },
    {
      problem_id: "2",
      alias: "כלום לא מעניין אותי",
    },
    {
      problem_id: "2",
      alias: "מצב דיכאוני",
    },
    {
      problem_id: "2",
      alias: "על הפנים לגמרי",
    },
    {
      problem_id: "2",
      alias: "תסמיני דיכאון",
    },
    {
      problem_id: "20",
      alias: "אין משמעות למה שאני עושה",
    },
    {
      problem_id: "20",
      alias: "אני חושב הרבה על החיים והמוות",
    },
    {
      problem_id: "20",
      alias: "אני לא מוצא משמעות",
    },
    {
      problem_id: "20",
      alias: "אני מרגיש ריק מבפנים",
    },
    {
      problem_id: "20",
      alias: "אני שואל את עצמי למה לחיות",
    },
    {
      problem_id: "3",
      alias: "C-PTSD",
    },
    {
      problem_id: "3",
      alias: "CPTSD",
    },
    {
      problem_id: "3",
      alias: "PTSD",
    },
    {
      problem_id: "3",
      alias: "אירוע טראומטי",
    },
    {
      problem_id: "3",
      alias: "אירוע קשה",
    },
    {
      problem_id: "3",
      alias: "הפרעה פוסט טראומטית",
    },
    {
      problem_id: "3",
      alias: "הפרעת דחק פוסט טראומטית",
    },
    {
      problem_id: "3",
      alias: "חוויה טראומטית",
    },
    {
      problem_id: "3",
      alias: "חוויות טראומטיות",
    },
    {
      problem_id: "3",
      alias: "טראומה",
    },
    {
      problem_id: "3",
      alias: "טראומה בילדות",
    },
    {
      problem_id: "3",
      alias: "טראומה מורכבת",
    },
    {
      problem_id: "3",
      alias: "טראומה נפשית",
    },
    {
      problem_id: "3",
      alias: "טראומטי",
    },
    {
      problem_id: "3",
      alias: "טראומת ילדות",
    },
    {
      problem_id: "3",
      alias: "נפגעתי",
    },
    {
      problem_id: "3",
      alias: "עברתי הטרדה",
    },
    {
      problem_id: "3",
      alias: "עברתי משהו קשה",
    },
    {
      problem_id: "3",
      alias: "פוסט טראומה",
    },
    {
      problem_id: "4",
      alias: "אני מפחד להיקשר",
    },
    {
      problem_id: "4",
      alias: "אני נמשך לאנשים לא נכונים",
    },
    {
      problem_id: "4",
      alias: "גירושין",
    },
    {
      problem_id: "4",
      alias: "התמודדות עם גירושין",
    },
    {
      problem_id: "4",
      alias: "התמודדות עם פרידה",
    },
    {
      problem_id: "4",
      alias: "יש לי בעיות בזוגיות",
    },
    {
      problem_id: "4",
      alias: "משבר זוגי",
    },
    {
      problem_id: "4",
      alias: "פרידה זוגית",
    },
    {
      problem_id: "4",
      alias: "קושי בזוגיות",
    },
    {
      problem_id: "4",
      alias: "קשה לי במערכות יחסים",
    },
    {
      problem_id: "4",
      alias: "קשה לי לסמוך על אנשים",
    },
    {
      problem_id: "4",
      alias: "קשיים בזוגיות",
    },
    {
      problem_id: "4",
      alias: "תהליך גירושין",
    },
    {
      problem_id: "5",
      alias: "הדרכה הורית",
    },
    {
      problem_id: "5",
      alias: "הדרכת הורים",
    },
    {
      problem_id: "5",
      alias: "יחסי הורים וילדים",
    },
    {
      problem_id: "5",
      alias: "ייעוץ להורים",
    },
    {
      problem_id: "5",
      alias: "ליווי הורים",
    },
    {
      problem_id: "5",
      alias: "מתח הורי",
    },
    {
      problem_id: "5",
      alias: "קונפליקטים בין הורים לילדים",
    },
    {
      problem_id: "5",
      alias: "קשיים בהורות",
    },
    {
      problem_id: "5",
      alias: "קשיים ביחסי הורים וילדים",
    },
    {
      problem_id: "5",
      alias: "תמיכה הורית",
    },
    {
      problem_id: "6",
      alias: "אין לי חברים קרובים",
    },
    {
      problem_id: "6",
      alias: "אני לא מצליח להשתלב",
    },
    {
      problem_id: "6",
      alias: "אני לבד חברתית",
    },
    {
      problem_id: "6",
      alias: "אני מחוץ לקבוצה",
    },
    {
      problem_id: "6",
      alias: "אני מרגיש לא שייך",
    },
    {
      problem_id: "6",
      alias: "בדידות",
    },
    {
      problem_id: "6",
      alias: "חוסר שייכות",
    },
    {
      problem_id: "6",
      alias: "קושי ביצירת קשרים חברתיים",
    },
    {
      problem_id: "6",
      alias: "קושי חברתי",
    },
    {
      problem_id: "6",
      alias: "קשה לי להתחבר לאנשים",
    },
    {
      problem_id: "6",
      alias: "קשיים ביצירת קשרים חברתיים",
    },
    {
      problem_id: "6",
      alias: "קשיים חברתיים",
    },
    {
      problem_id: "6",
      alias: "תחושת חוסר שייכות",
    },
    {
      problem_id: "67",
      alias: "הפרעות אישיות",
    },
    {
      problem_id: "67",
      alias: "הפרעת אישיות",
    },
    {
      problem_id: "68",
      alias: "התעללות מינית",
    },
    {
      problem_id: "68",
      alias: "טראומה מינית",
    },
    {
      problem_id: "68",
      alias: "נפגעות תקיפה מינית",
    },
    {
      problem_id: "68",
      alias: "נפגעי תקיפה מינית",
    },
    {
      problem_id: "68",
      alias: "פגיעה מינית",
    },
    {
      problem_id: "68",
      alias: "פגיעות מיניות",
    },
    {
      problem_id: "68",
      alias: "תקיפה מינית",
    },
    {
      problem_id: "7",
      alias: "אני לא בטוח בזהות שלי",
    },
    {
      problem_id: "7",
      alias: "אני לא יודע מי אני",
    },
    {
      problem_id: "7",
      alias: "אני מבולבל לגבי עצמי",
    },
    {
      problem_id: "7",
      alias: "ביטחון עצמי נמוך",
    },
    {
      problem_id: "7",
      alias: "דימוי עצמי",
    },
    {
      problem_id: "7",
      alias: "דימוי עצמי נמוך",
    },
    {
      problem_id: "7",
      alias: "זהות עצמית",
    },
    {
      problem_id: "7",
      alias: "חוסר ביטחון עצמי",
    },
    {
      problem_id: "7",
      alias: "משבר זהות",
    },
    {
      problem_id: "7",
      alias: "ערך עצמי נמוך",
    },
    {
      problem_id: "7",
      alias: "קשיי זהות",
    },
    {
      problem_id: "7",
      alias: "קשיים בדימוי העצמי",
    },
    {
      problem_id: "7",
      alias: "קשיים בזהות העצמית",
    },
    {
      problem_id: "8",
      alias: "הצפה רגשית",
    },
    {
      problem_id: "8",
      alias: "התפרצויות זעם",
    },
    {
      problem_id: "8",
      alias: "ויסות רגשי",
    },
    {
      problem_id: "8",
      alias: "קושי בשליטה בכעסים",
    },
    {
      problem_id: "8",
      alias: "קשיים בוויסות רגשי",
    },
    {
      problem_id: "8",
      alias: "קשיים בשליטה בכעסים",
    },
    {
      problem_id: "9",
      alias: "OCD",
    },
    {
      problem_id: "9",
      alias: "אני בודק דברים כל הזמן",
    },
    {
      problem_id: "9",
      alias: "אני חייב לעשות דברים שוב ושוב",
    },
    {
      problem_id: "9",
      alias: "אני לא מצליח להפסיק לחשוב על זה",
    },
    {
      problem_id: "9",
      alias: "הפרעה אובססיבית קומפולסיבית",
    },
    {
      problem_id: "9",
      alias: "הפרעה טורדנית כפייתית",
    },
    {
      problem_id: "9",
      alias: "התנהגויות כפייתיות",
    },
    {
      problem_id: "9",
      alias: "התנהגות כפייתית",
    },
    {
      problem_id: "9",
      alias: "טורדנות כפייתית",
    },
    {
      problem_id: "9",
      alias: "טקס כפייתי",
    },
    {
      problem_id: "9",
      alias: "טקסים כפייתיים",
    },
    {
      problem_id: "9",
      alias: "יש לי טקסים שאני חייב לבצע",
    },
    {
      problem_id: "9",
      alias: "יש לי מחשבות טורדניות",
    },
    {
      problem_id: "9",
      alias: "מחשבות חודרניות",
    },
    {
      problem_id: "9",
      alias: "מחשבות טורדניות",
    },
    {
      problem_id: "9",
      alias: "מחשבות כפייתיות",
    },
  ],
};
