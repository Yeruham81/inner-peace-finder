
import { createFileRoute, Link } from "@tanstack/react-router";

import {
  TherapistProfileView,
  type TherapistProfileViewData,
} from "@/components/therapist-profile-view";

export const Route = createFileRoute("/profile-preview-demo")({
  head: () => ({
    meta: [
      { title: "מוק פרופיל מטפל ציבורי | Tipulinks" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProfilePreviewDemoPage,
});

const MOCK_THERAPIST: TherapistProfileViewData = {
  id: "public-profile-demo",
  full_name: "דניאל לביא",
  professional_title: "פסיכולוג קליני מומחה ומטפל זוגי ומשפחתי",
  short_intro:
    "אני מלווה מבוגרים, זוגות והורים בתהליכי שינוי ממוקדים, בגישה רגישה, מעשית ומותאמת לקצב האישי.",
  full_description:
    "אני מאמין שטיפול טוב מתחיל במפגש אנושי בטוח, מכבד ולא שיפוטי. לאורך השנים ליוויתי אנשים שהתמודדו עם חרדה, דיכאון, משברי חיים, קשיים ביחסים ותחושת תקיעות.\n\nבטיפול אנחנו מבררים יחד מה מעסיק אתכם, מגדירים מטרות אפשריות ובוחרים את דרך העבודה המתאימה. אני משלב בין הקשבה מעמיקה לבין כלים מעשיים שאפשר לקחת גם אל מחוץ לחדר הטיפול. התהליך מותאם לצרכים, להעדפות ולקצב של כל אדם, זוג או משפחה, ויכול להיות קצר וממוקד או ממושך ומעמיק יותר.",
  education_training:
    "תואר שני בפסיכולוגיה קלינית, אוניברסיטת תל אביב.\nהתמחות בפסיכולוגיה קלינית במרכז לבריאות הנפש שלוותה.\nהכשרה מתקדמת בטיפול קוגניטיבי־התנהגותי (CBT).\nהכשרה בטיפול זוגי ומשפחתי ובטיפול ממוקד רגש.",
  professional_experience:
    "מטפל בקליניקה פרטית משנת 2010.\nפסיכולוג בכיר במרפאת בריאות הנפש בקהילה.\nניסיון בטיפול פרטני, זוגי ומשפחתי ובהדרכת הורים.\nמדריך אנשי מקצוע וצוותים טיפוליים.",
  years_experience: 16,
  city: "תל אביב-יפו",
  image_url: null,
  verified: true,
  lgbtq_affirming: true,
  offers_free_intro: true,
  free_intro_types: ["phone", "video", "in_person"],
  free_intro_duration_minutes: 20,
  professions: [
    { slug: "clinical-psychologist", name: "פסיכולוג קליני", is_primary: true },
    { slug: "couples-therapist", name: "מטפל זוגי", is_primary: false },
    { slug: "family-therapist", name: "מטפל משפחתי", is_primary: false },
    { slug: "parent-counselor", name: "מדריך הורים", is_primary: false },
  ],
  problems: [
    { id: "1", slug: "anxiety", name: "חרדה" },
    { id: "2", slug: "depression", name: "דיכאון" },
    { id: "3", slug: "stress", name: "מתח ולחץ" },
    { id: "4", slug: "life-crisis", name: "משברי חיים" },
    { id: "5", slug: "relationship-difficulties", name: "קשיים בזוגיות" },
    { id: "6", slug: "self-esteem", name: "דימוי עצמי נמוך" },
    { id: "7", slug: "grief", name: "אבל ואובדן" },
    { id: "8", slug: "trauma", name: "טראומה" },
    { id: "9", slug: "parenting", name: "קשיים בהורות" },
    { id: "10", slug: "burnout", name: "שחיקה" },
    { id: "11", slug: "social-anxiety", name: "חרדה חברתית" },
    { id: "12", slug: "transitions", name: "שינויים ומעברים" },
  ],
  modalities: [
    { slug: "cbt", name: "CBT" },
    { slug: "psychodynamic", name: "טיפול פסיכודינמי" },
    { slug: "integrative", name: "טיפול אינטגרטיבי" },
    { slug: "act", name: "ACT" },
    { slug: "emotion-focused", name: "טיפול ממוקד רגש" },
    { slug: "mindfulness", name: "מיינדפולנס" },
    { slug: "solution-focused", name: "טיפול ממוקד פתרון" },
    { slug: "attachment-based", name: "טיפול מבוסס התקשרות" },
  ],
  populations: [
    { slug: "adults", name: "מבוגרים" },
    { slug: "young-adults", name: "צעירים" },
    { slug: "couples", name: "זוגות" },
    { slug: "parents", name: "הורים" },
    { slug: "families", name: "משפחות" },
    { slug: "lgbtq", name: "הקהילה הגאה" },
    { slug: "seniors", name: "הגיל השלישי" },
  ],
  therapy_formats: [
    { slug: "individual", name: "טיפול פרטני" },
    { slug: "couple", name: "טיפול זוגי" },
    { slug: "family", name: "טיפול משפחתי" },
    { slug: "parent-child", name: "טיפול הורה–ילד" },
    { slug: "parent-guidance", name: "הדרכת הורים" },
    { slug: "group", name: "טיפול קבוצתי" },
  ],
  locations: [
    {
      location_type: "clinic",
      city: "תל אביב-יפו",
      region: "תל אביב וגוש דן",
      is_primary: true,
      accessibility_status: "accessible",
      accessibility_features: ["step_free_entrance", "elevator", "accessible_parking", "accessible_restroom"],
      accessibility_note: "הכניסה הנגישה נמצאת בצדו האחורי של הבניין. יש לתאם פתיחת שער מראש.",
    },
    {
      location_type: "clinic",
      city: "רמת גן",
      region: "תל אביב וגוש דן",
      is_primary: false,
      accessibility_status: "partially_accessible",
      accessibility_features: ["elevator"],
      accessibility_note: "בכניסה לבניין קיימת מדרגה אחת.",
    },
    {
      location_type: "clinic",
      city: "הרצליה",
      region: "השרון",
      is_primary: false,
      accessibility_status: "not_accessible",
      accessibility_features: [],
      accessibility_note: "הקליניקה נמצאת בקומה שנייה ללא מעלית.",
    },
    {
      location_type: "online",
      city: null,
      region: null,
      is_primary: false,
      accessibility_status: "unknown",
      accessibility_features: [],
      accessibility_note: null,
    },
    {
      location_type: "home_visit",
      city: null,
      region: "תל אביב וגוש דן",
      is_primary: false,
      accessibility_status: "unknown",
      accessibility_features: [],
      accessibility_note: null,
    },
    {
      location_type: "home_visit",
      city: null,
      region: "השרון",
      is_primary: false,
      accessibility_status: "unknown",
      accessibility_features: [],
      accessibility_note: null,
    },
  ],
  professional_memberships: [
    { organization_name: "הסתדרות הפסיכולוגים בישראל", member_since: 2010 },
    { organization_name: "האגודה הישראלית לטיפול זוגי ומשפחתי", member_since: 2015 },
    { organization_name: "האיגוד הישראלי לפסיכותרפיה", member_since: 2018 },
  ],
  service_arrangements: [
    { organization_name: "כללית מושלם", note: "אפשרות להחזר בהתאם לזכאות" },
    { organization_name: "מכבי שלי", note: "בהצגת התחייבות מתאימה" },
    { organization_name: "משרד הביטחון", note: "לזכאים ובאישור מראש" },
    { organization_name: "ביטוח פרטי", note: "ניתנת קבלה לצורך הגשת בקשת החזר" },
  ],
  languages: [
    { code: "he", name: "עברית" },
    { code: "en", name: "אנגלית" },
    { code: "fr", name: "צרפתית" },
  ],
};

function ProfilePreviewDemoPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-brand-soft/30">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>
            <strong>עמוד הדגמה בלבד:</strong> כל האפשרויות הופעלו כדי לבדוק את תצוגת הפרופיל הציבורי.
          </p>
          <Link to="/" className="font-semibold underline underline-offset-4">
            חזרה לעמוד הבית
          </Link>
        </div>

        <TherapistProfileView therapist={MOCK_THERAPIST} interactive={false} />
      </div>
    </div>
  );
}
