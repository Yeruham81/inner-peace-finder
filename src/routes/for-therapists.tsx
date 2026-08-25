import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  Check,
  CircleDollarSign,
  FileCheck2,
  Headphones,
  Languages,
  MapPin,
  MessageCircleMore,
  PauseCircle,
  PencilLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRoundSearch,
  UsersRound,
  WalletCards,
} from "lucide-react";

const THERAPIST_SIGNUP_URL = "/auth" as const;

export const Route = createFileRoute("/for-therapists")({
  head: () => ({
    meta: [
      {
        title: "טיפולינקס למטפלים | פניות ממוקדות ללא דמי מנוי",
      },
      {
        name: "description",
        content:
          "פתחו פרופיל מטפל בחינם בטיפולינקס וקבלו פניות ממוקדות באמצעות מנוע חיפוש חכם מבוסס בינה מלאכותית. ללא דמי מנוי וללא התחייבות.",
      },
      {
        property: "og:title",
        content: "טיפולינקס למטפלים | פניות ממוקדות ללא דמי מנוי",
      },
      {
        property: "og:description",
        content: "פלטפורמה חכמה שמחברת בין אנשים שמחפשים עזרה לבין מטפלים רלוונטיים לצורך שתיארו.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary",
      },
    ],
  }),
  component: ForTherapistsPage,
});

const quickLinks = [
  { href: "#how-it-works", label: "איך זה עובד?" },
  { href: "#therapist-benefits", label: "מה יוצא לכם מזה?" },
  { href: "#profile-management", label: "ניהול הפרופיל" },
  { href: "#join", label: "הצטרפות בחינם" },
];

const commonSearchProblems = [
  "לדעת מראש אם הם צריכים פסיכולוג, פסיכותרפיסט או איש מקצוע אחר",
  "לאבחן בעצמם את הקושי לפני שהם בכלל יודעים למי לפנות",
  "לבחור בין שיטות טיפול ומונחים מקצועיים שהם כלל לא מכירים",
];

const matchingParameters = [
  {
    icon: Search,
    label: "תחומי טיפול",
  },
  {
    icon: MapPin,
    label: "מיקום ואזור",
  },
  {
    icon: Languages,
    label: "שפת הטיפול",
  },
  {
    icon: UsersRound,
    label: "גיל ואוכלוסייה",
  },
];

const therapistAdvantages = [
  {
    icon: BadgeCheck,
    title: "פרופיל מקצועי",
    description: "פותחים פרופיל מקצועי תוך דקות ומצטרפים למאגר המטפלים של טיפולינקס",
  },
  {
    icon: UserRoundSearch,
    title: "חשיפה ממוקדת",
    description: "משתמשים שמחפשים את סוג הטיפול שאתם מציעים נחשפים לפרופיל שלכם",
  },
  {
    icon: CircleDollarSign,
    title: "מודל תשלום פשוט",
    description: "משלמים רק על פניות שמתקבלות, ללא דמי הרשמה וללא דמי מנוי חודשיים קבועים",
  },
  {
    icon: SlidersHorizontal,
    title: "כלי ניהול מתקדמים",
    description: "קובעים תקרת תקציב חודשית, עוקבים אחר הנתונים ומנהלים את הפעילות באופן עצמאי",
  },
];

const profileManagementFeatures = [
  {
    icon: PencilLine,
    title: "פרופיל מקצועי מפורט",
    description: "הציגו את עצמכם, הניסיון שלכם, תחומי הטיפול, האוכלוסיות, השירותים ומידע נוסף שעוזר למטופל להכיר אתכם.",
  },
  {
    icon: FileCheck2,
    title: "אימות תארים והסמכות",
    description: "העבירו מסמכים מקצועיים לבדיקה וקבלו סימון מתאים בפרופיל לאחר השלמת תהליך האימות.",
  },
  {
    icon: MessageCircleMore,
    title: "בחירת דרכי ההתקשרות",
    description: "הגדירו אילו אמצעי התקשרות נוחים לכם ובאילו דרכים תרצו לקבל פניות מהמערכת.",
  },
  {
    icon: WalletCards,
    title: "תקרת תקציב חודשית",
    description: "קבעו מראש מסגרת הוצאה חודשית כדי לשמור על שליטה מלאה בתקציב הפעילות.",
  },
  {
    icon: BarChart3,
    title: "פניות וסטטיסטיקות במקום אחד",
    description: "עקבו אחר הפניות שקיבלתם וצפו בנתוני ביצוע שמסייעים להבין כיצד הפרופיל שלכם פועל.",
  },
  {
    icon: PauseCircle,
    title: "עריכה, עדכון והקפאה עצמאיים",
    description: "עדכנו פרטים או הקפיאו זמנית את הפרופיל בכל עת, באופן עצמאי וללא תלות בצוות האתר.",
  },
  {
    icon: ShieldCheck,
    title: "מנגנוני הגנה מפני ספאם",
    description: "מערכת יצירת הקשר כוללת שכבות אבטחה ובקרה שנועדו לצמצם פניות אוטומטיות ושימוש לרעה.",
  },
  {
    icon: Headphones,
    title: "שירות לקוחות ותמיכה טכנית",
    description: "אם נתקלתם בבעיה או צריכים עזרה, יש לכם כתובת ברורה לקבלת מענה ותמיכה.",
  },
];

function ForTherapistsPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-hidden bg-gradient-to-b from-brand-soft/40 via-background to-brand-soft/40"
    >
      <VisionSection />

      <HowItWorksSection />

      <TherapistBenefitsSection />

      <ProfileManagementSection />

      <JoinSection />
    </main>
  );
}

function VisionSection() {
  return (
    <section id="smart-search" className="scroll-mt-6 border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-24">
        <nav aria-label="ניווט מהיר בעמוד" className="lg:col-span-2">
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {quickLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/15 bg-background/80 px-3.5 py-2 text-sm font-medium text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background px-4 py-2 text-sm font-medium text-primary shadow-sm">
            <Sparkles className="h-4 w-4" />
            דרך פשוטה יותר למצוא טיפול
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl sm:leading-tight">
            המטופל לא צריך לדעת מראש איזה מטפל לחפש
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            אדם שמתמודד עם חרדה, קשיי שינה, משבר בזוגיות או קושי אצל הילד יודע בדרך כלל מה מפריע לו — אבל לא בהכרח יודע
            אם הוא צריך פסיכולוג, פסיכותרפיסט או איש מקצוע אחר.
          </p>

          <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">
            הוא גם לא אמור לבחור מטפל לפי שיטת טיפול שמעולם לא שמע עליה. בטיפולינקס מתחילים מהקושי עצמו: המשתמש מתאר
            במילים שלו מה עובר עליו, והמנוע מחפש עבורו מטפלים רלוונטיים שמציעים טיפול בתחום המתאים.
          </p>

          <div className="mt-7 rounded-2xl border-r-4 border-primary bg-background p-5 shadow-sm">
            <p className="text-base font-semibold leading-8 text-foreground">
              במקום לשאול את המשתמש "איזה מטפל אתה מחפש?" — טיפולינקס מתחילה בשאלה "במה אפשר לעזור?"
            </p>

            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              כך אפשר להגיע להתאמה טובה גם כשהאדם יודע לתאר את הקושי, אבל עדיין לא מכיר את עולם המקצועות והשיטות
              הטיפוליות.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-background p-6 shadow-lg shadow-foreground/5 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft/60 text-primary">
              <UserRoundSearch className="h-6 w-6" />
            </div>

            <div>
              <p className="text-sm font-medium text-primary">למה החיפוש הרגיל מקשה?</p>

              <h2 className="mt-1 text-xl font-bold text-foreground">הוא מצפה מהאדם לדעת את התשובה מראש</h2>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {commonSearchProblems.map((problem) => (
              <div key={problem} className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                </div>

                <p className="text-sm leading-7 text-foreground">{problem}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-primary/10 p-5">
            <p className="text-sm font-semibold text-primary">דוגמה פשוטה</p>

            <p className="mt-2 text-base font-medium leading-7 text-foreground">
              "אני מתעורר כמה פעמים בלילה, עייף במשך היום ומרגיש שהלחץ בעבודה רק מחמיר את זה."
            </p>

            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              המשתמש לא צריך לדעת איך קוראים לבעיה או איזה מקצוע מטפל בה. הוא מתאר את המצב — וטיפולינקס עושה את עבודת
              המיקוד.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-6 border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">איך זה עובד?</p>

          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            מהתיאור החופשי — לרשימת מטפלים רלוונטיים
          </h2>

          <p className="mt-5 text-base leading-8 text-muted-foreground">
            מנוע החיפוש של טיפולינקס מבין את המשמעות של הבקשה, מזהה את הצרכים הרלוונטיים ומשווה אותם למידע המקצועי
            בפרופילי המטפלים.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-[1fr_auto_1.15fr_auto_1fr] md:items-stretch">
          <SearchUserCard />

          <DesktopArrow />

          <TipulinksEngineCard />

          <DesktopArrow />

          <MatchedTherapistCard />
        </div>

        <div className="mt-10 rounded-3xl border border-primary/15 bg-primary/5 p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <h3 className="text-xl font-bold text-foreground">ההתאמה אינה מבוססת על גורם אחד</h3>

              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                המערכת מזהה את תחומי הטיפול הרלוונטיים ומשלבת אותם עם העדפות וצרכים נוספים שהמשתמש הגדיר כדי לצמצם את
                החיפוש.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {matchingParameters.map((parameter) => {
                const Icon = parameter.icon;

                return (
                  <div
                    key={parameter.label}
                    className="flex min-h-24 flex-col items-center justify-center rounded-2xl border border-primary/10 bg-background p-4 text-center shadow-sm"
                  >
                    <Icon className="h-5 w-5 text-primary" />

                    <span className="mt-3 text-sm font-medium text-foreground">{parameter.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-6 text-muted-foreground">
          מנוע החיפוש של טיפולינקס לא מאבחן ולא מתיימר להחליף ייעוץ מקצועי. הוא מסייע למקד את החיפוש על בסיס המידע
          שהמשתמש מסר והפרטים המופיעים בפרופילי המטפלים.
        </p>
      </div>
    </section>
  );
}

function SearchUserCard() {
  return (
    <article className="rounded-3xl border border-primary/10 bg-primary/5 p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
        <UserRoundSearch className="h-6 w-6" />
      </div>

      <p className="mt-5 text-sm font-semibold text-primary">1. המשתמש מתאר את הקושי</p>

      <h3 className="mt-1 text-xl font-bold text-foreground">כותב במילים שלו</h3>

      <div className="mt-5 rounded-2xl border border-primary/10 bg-background/90 p-4">
        <MessageCircleMore className="h-5 w-5 text-primary" />

        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          "הבן שלי בן 9 התחיל לסרב ללכת לבית הספר, מתלונן על כאבי בטן בכל בוקר ונמנע ממפגשים עם ילדים. אנחנו לא יודעים
          אם מדובר בחרדה או בקושי חברתי ואיזה איש מקצוע יכול לעזור לו."
        </p>
      </div>
    </article>
  );
}

function TipulinksEngineCard() {
  return (
    <article className="rounded-3xl border border-primary/20 bg-primary/10 p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
        <BrainCircuit className="h-6 w-6" />
      </div>

      <p className="mt-5 text-sm font-semibold text-primary">2. טיפולינקס מבינה את הצורך</p>

      <h3 className="mt-1 text-xl font-bold text-foreground">מתרגמת את התיאור לחיפוש מקצועי</h3>

      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        המערכת מזהה מתוך התיאור את הקשיים והמאפיינים הרלוונטיים ומחפשת אותם מול המידע המקצועי שהוגדר בפרופילי המטפלים.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {["טיפול רגשי לילדים", "חרדה", "קשיים חברתיים", "הדרכת הורים"].map((item) => (
          <span
            key={item}
            className="rounded-full border border-primary/15 bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </article>
  );
}

function MatchedTherapistCard() {
  return (
    <article className="rounded-3xl border border-primary/30 bg-primary/20 p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
        <BadgeCheck className="h-6 w-6" />
      </div>

      <p className="mt-5 text-sm font-semibold text-primary">3. מתקבלת רשימה ממוקדת</p>

      <h3 className="mt-1 text-xl font-bold text-foreground">מטפלים רלוונטיים לצורך שתואר</h3>

      <p className="mt-4 text-sm leading-7 text-foreground/80">
        טיפולינקס בוחנת אילו פרופילים מתאימים לתחומי הטיפול ולמאפיינים שנמצאו ומציגה למשתמש רשימה רלוונטית יותר.
      </p>

      <div className="mt-5 rounded-2xl border border-primary/20 bg-background/90 p-4">
        <div className="flex items-start gap-3">
          <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />

          <p className="text-sm leading-7 text-muted-foreground">
            המשתמש יכול לעבור בין הפרופילים ולבחור למי לפנות מתוך הבנה טובה יותר של ההתאמה.
          </p>
        </div>
      </div>
    </article>
  );
}

function DesktopArrow() {
  return (
    <div className="hidden items-center justify-center md:flex">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/15 bg-background text-primary shadow-sm">
        <ArrowLeft className="h-5 w-5" />
      </div>
    </div>
  );
}

function TherapistBenefitsSection() {
  return (
    <section id="therapist-benefits" className="scroll-mt-6 border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">מה יוצא לכם מזה?</p>

          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            יותר רלוונטיות, פחות הוצאה קבועה
          </h2>

          <p className="mt-5 text-base leading-8 text-muted-foreground">
            טיפולינקס נועדה לעזור לכם להגיע לאנשים שמחפשים טיפול שמתאים למה שאתם מציעים — בלי לשלם דמי מנוי רק כדי
            להישאר באתר.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {therapistAdvantages.map((advantage) => {
            const Icon = advantage.icon;

            return (
              <article
                key={advantage.title}
                className="group rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm transition hover:border-primary/20 hover:bg-brand-soft/30 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft/60 text-primary">
                  <Icon className="h-6 w-6" />
                </div>

                <h3 className="mt-5 text-lg font-bold leading-7 text-foreground">{advantage.title}</h3>

                <p className="mt-3 text-sm leading-7 text-muted-foreground">{advantage.description}</p>
              </article>
            );
          })}
        </div>
        <div className="mt-10 rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-primary">למה זה משנה?</p>

              <h3 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                גם מי שלא חיפש את המקצוע שלכם יכול להגיע אליכם
              </h3>
            </div>

            <p className="text-sm leading-7 text-muted-foreground">
              אדם שמחפש עזרה לא תמיד יודע איך נקרא המקצוע שמתאים לו. כשהפרופיל שלכם מתאר באופן מדויק במה אתם מטפלים ולמי
              אתם מסייעים, מנוע החיפוש יכול לזהות את הרלוונטיות מתוך הצורך שהמשתמש תיאר — ולא רק מתוך מילת מקצוע שחיפש
              מראש.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileManagementSection() {
  return (
    <section id="profile-management" className="scroll-mt-6 border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">ממשק ניהול מתקדם</p>

          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            כל הכלים לניהול הפרופיל במקום אחד
          </h2>

          <p className="mt-5 text-base leading-8 text-muted-foreground">
            אזור אישי עם כל מה שצריך כדי לנהל, לעדכן ולעקוב אחר הפרופיל שלכם באופן עצמאי
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {profileManagementFeatures.map((feature) => {
            const Icon = feature.icon;

            return (
              <article
                key={feature.title}
                className="group rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm transition hover:border-primary/20 hover:bg-brand-soft/30"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
                  <Icon className="h-5 w-5" />
                </div>

                <h3 className="mt-5 text-lg font-bold leading-7 text-foreground">{feature.title}</h3>

                <p className="mt-3 text-sm leading-7 text-muted-foreground">{feature.description}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col gap-4 rounded-3xl border border-border bg-brand-soft/40 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-sm font-semibold text-primary">הפרופיל נשאר בשליטה שלכם</p>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              אין צורך לפנות לצוות האתר בכל שינוי. תוכלו לעדכן מידע מקצועי, להתאים את דרכי הקשר, לשנות את מסגרת התקציב
              או להקפיא את הפרופיל בהתאם לצורך.
            </p>
          </div>

          <ShieldCheck className="hidden h-10 w-10 shrink-0 text-primary sm:block" />
        </div>
      </div>
    </section>
  );
}

function JoinSection() {
  return (
    <section id="join" className="scroll-mt-6 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-primary/20 bg-primary/10 px-6 py-12 text-center shadow-sm sm:px-10 sm:py-16">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background px-4 py-2 text-sm font-semibold text-primary shadow-sm">
          <Sparkles className="h-4 w-4" />
          הטבות למצטרפים חדשים
        </div>

        <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          תנו למטופלים למצוא אתכם
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
          הצטרפו לטיפולינקס והתחילו לקבל פניות רלוונטיות
        </p>

        <div className="mt-8">
          <Link
            to={THERAPIST_SIGNUP_URL}
            search={{ mode: "signup" as const }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            פתיחת פרופיל מטפל בחינם
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
