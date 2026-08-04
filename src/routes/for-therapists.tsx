import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  BrainCircuit,
  Check,
  CircleDollarSign,
  Languages,
  MapPin,
  MessageCircleMore,
  PauseCircle,
  Search,
  Sparkles,
  UserRoundSearch,
  UsersRound,
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
        content: "פלטפורמה חכמה שמחברת בין אנשים שמחפשים עזרה לבין המטפלים המתאימים להם ביותר.",
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

const commonSearchProblems = [
  "לדעת מראש איזה איש מקצוע הם צריכים",
  "להגדיר או לאבחן בעצמם את מה שהם מרגישים",
  "להשוות בין שיטות טיפול ומונחים שאינם מכירים",
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
    title: "פתיחת פרופיל בחינם",
    description: "אין תשלום עבור יצירת הפרופיל, השלמת הפרטים המקצועיים או הופעה במאגר המטפלים.",
  },
  {
    icon: CircleDollarSign,
    title: "ללא דמי מנוי חודשיים",
    description: "אין תשלום קבוע בכל חודש ואין צורך לשלם מראש רק כדי להישאר פעילים בפלטפורמה.",
  },
  {
    icon: MessageCircleMore,
    title: "תשלום לפי פנייה",
    description: "התשלום מתבצע עבור פניות שהגיעו דרך טיפולינקס לאחר תהליך התאמה ממוקד.",
  },
  {
    icon: PauseCircle,
    title: "ללא התחייבות",
    description: "אפשר להקפיא את הפרופיל בכל שלב ולכל פרק זמן, ולהפעיל אותו מחדש כשמתאים לכם.",
  },
];

const therapistControlPoints = [
  "הוספת כל תחומי העיסוק, שיטות הטיפול והניסיון המקצועי",
  "הגדרת אזורי פעילות, שפות, אוכלוסיות ואפשרויות טיפול",
  "עדכון הפרופיל באופן עצמאי בכל עת",
  "הקפאת הפרופיל ללא הגבלת זמן",
  "קבלת הטבות עבור צירוף מטפלים נוספים",
];

function ForTherapistsPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-hidden bg-gradient-to-b from-brand-soft/50 via-background to-brand-soft/50"
    >
      <VisionSection />

      <HowItWorksSection />

      <TherapistBenefitsSection />

      <JoinSection />
    </main>
  );
}

function VisionSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background px-4 py-2 text-sm font-medium text-primary shadow-sm">
            <Sparkles className="h-4 w-4" />
            החזון של טיפולינקס
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl sm:leading-tight">
            לחפש עזרה לא אמור להיות מסובך
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            אנשים שחווים מצוקה, קושי רגשי, משבר, בעיה משפחתית או מצב שמפריע לחיי היום־יום פונים לחפש עזרה דווקא כשהם
            מבולבלים, מוצפים ולא תמיד יודעים להסביר מה עובר עליהם.
          </p>

          <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">
            למרות זאת, לא מעט אתרי חיפוש מצפים מהם לדעת מראש איזה איש מקצוע הם צריכים, לזהות בעצמם את הבעיה ולמיין
            מטפלים לפי מקצועות ושיטות טיפול שהם כלל אינם מכירים.
          </p>

          <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">
            חלקם מגיעים בעקבות זאת לאנשי מקצוע שאינם מתאימים לצורך שלהם. אחרים מתייאשים באמצע הדרך ואינם פונים לקבלת
            עזרה כלל.
          </p>

          <div className="mt-7 rounded-2xl border-r-4 border-primary bg-background p-5 shadow-sm">
            <p className="text-base font-semibold leading-8 text-foreground">טיפולינקס נכנסת בדיוק בנקודה הזאת.</p>

            <p className="mt-2 text-base leading-8 text-muted-foreground">
              היא מסייעת לאנשים למצוא את המטפלים המתאימים להם ביותר, גם בלי לאבחן את עצמם, לבחור מראש מקצוע טיפולי או
              להתמצא במונחים מקצועיים.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-background p-6 shadow-lg shadow-foreground/5 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft/50 text-primary">
              <UserRoundSearch className="h-6 w-6" />
            </div>

            <div>
              <p className="text-sm font-medium text-primary">הבעיה בתהליך הקיים</p>

              <h2 className="mt-1 text-xl font-bold text-foreground">מצפים מהאדם לדעת את התשובה מראש</h2>
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

          <div className="mt-6 rounded-2xl bg-brand-soft/50 p-5">
            <p className="text-sm font-semibold text-primary">נקודת המוצא של טיפולינקס</p>

            <p className="mt-2 text-base font-medium leading-7 text-foreground">
              לא להתחיל מהאבחנה או משיטת הטיפול, אלא מהאדם ומהקושי שהוא מתאר.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">איך טיפולינקס עובדת?</p>

          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            מנוע חיפוש חכם שמחבר בין הצורך לבין המטפל
          </h2>

          <p className="mt-5 text-base leading-8 text-muted-foreground">
            טיפולינקס משלבת מנוע חיפוש מתקדם עם בינה מלאכותית, שמסוגל להבין את המשמעות של מה שאנשים כותבים ולא להסתפק
            בחיפוש מילים או סינון טכני של רשימות.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_auto_1.15fr_auto_1fr] lg:items-stretch">
          <SearchUserCard />

          <DesktopArrow />

          <TipulinksEngineCard />

          <DesktopArrow />

          <MatchedTherapistCard />
        </div>

        <div className="mt-10 rounded-3xl border border-border bg-brand-soft/50 p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <h3 className="text-xl font-bold text-foreground">ההתאמה אינה מבוססת על גורם אחד</h3>

              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                המערכת מזהה את תחומי הטיפול הרלוונטיים מתוך הפרופיל המקצועי ומשלבת אותם עם העדפות וצרכים נוספים שהמשתמש
                הגדיר.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {matchingParameters.map((parameter) => {
                const Icon = parameter.icon;

                return (
                  <div
                    key={parameter.label}
                    className="flex min-h-24 flex-col items-center justify-center rounded-2xl border border-border bg-background p-4 text-center shadow-sm"
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
          טיפולינקס לא מאבחנת את המשתמש ואינה מחליפה ייעוץ מקצועי. היא מסייעת למקד את החיפוש על בסיס המידע שנכתב והפרטים
          שמופיעים בפרופילי המטפלים.
        </p>
      </div>
    </section>
  );
}

function SearchUserCard() {
  return (
    <article className="rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft/50 text-primary">
        <UserRoundSearch className="h-6 w-6" />
      </div>

      <p className="mt-5 text-sm font-semibold text-primary">משתמש שמחפש עזרה</p>

      <h3 className="mt-1 text-xl font-bold text-foreground">כותב במילים שלו</h3>

      <div className="mt-5 rounded-2xl border border-border bg-background p-4">
        <MessageCircleMore className="h-5 w-5 text-primary" />

        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          "הבן שלי בן 9 התחיל לסרב ללכת לבית הספר, מתלונן על כאבי בטן בכל בוקר ונמנע ממפגשים עם ילדים. אנחנו לא יודעים
          אם מדובר בחרדה או בקושי חברתי ואיזה איש מקצוע יכול לעזור לו.”
        </p>
      </div>
    </article>
  );
}

function TipulinksEngineCard() {
  return (
    <article className="rounded-3xl border border-primary/20 bg-brand-soft/50 p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
        <BrainCircuit className="h-6 w-6" />
      </div>

      <p className="mt-5 text-sm font-semibold text-primary">מנוע ההתאמה של טיפולינקס</p>

      <h3 className="mt-1 text-xl font-bold text-foreground">מבין את משמעות החיפוש</h3>

      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        הבינה המלאכותית מזהה מתוך התיאור את הצרכים, הקשיים והמאפיינים הרלוונטיים ומתרגמת אותם לחיפוש מקצועי במאגר
        המטפלים.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {["טיפול רגשי לילדים", "חרדה", "קשיים חברתיים", "הדרכת הורים"].map((item) => (
          <span
            key={item}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
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
    <article className="rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft/50 text-primary">
        <BadgeCheck className="h-6 w-6" />
      </div>

      <p className="mt-5 text-sm font-semibold text-primary">המטפלים המתאימים</p>

      <h3 className="mt-1 text-xl font-bold text-foreground">מוצגים לפי רמת ההתאמה</h3>

      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        טיפולינקס בוחנת אילו פרופילים כוללים את תחומי העיסוק, ההכשרה, שיטות הטיפול והמאפיינים המתאימים לחיפוש.
      </p>

      <div className="mt-5 rounded-2xl border border-border bg-background p-4">
        <div className="flex items-start gap-3">
          <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />

          <p className="text-sm leading-7 text-muted-foreground">
            המשתמש מקבל רשימה ממוקדת יותר ויכול לפנות למטפל מתוך הבנה טובה יותר של ההתאמה.
          </p>
        </div>
      </div>
    </article>
  );
}

function DesktopArrow() {
  return (
    <div className="hidden items-center justify-center lg:flex">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-primary shadow-sm">
        <ArrowLeft className="h-5 w-5" />
      </div>
    </div>
  );
}

function TherapistBenefitsSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">מה טיפולינקס מציעה למטפלים?</p>

          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            פניות ממוקדות, ללא הוצאה חודשית קבועה
          </h2>

          <p className="mt-5 text-base leading-8 text-muted-foreground">
            המטרה היא לא רק להציג את שמכם ברשימה, אלא להפנות אליכם אנשים שהצרכים שלהם תואמים בסבירות גבוהה את השירותים
            שאתם מציעים.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {therapistAdvantages.map((advantage) => {
            const Icon = advantage.icon;

            return (
              <article key={advantage.title} className="rounded-3xl border border-border bg-background p-6 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft/50 text-primary">
                  <Icon className="h-6 w-6" />
                </div>

                <h3 className="mt-5 text-lg font-bold text-foreground">{advantage.title}</h3>

                <p className="mt-3 text-sm leading-7 text-muted-foreground">{advantage.description}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-10 grid gap-8 rounded-3xl border border-border bg-background p-6 shadow-sm sm:p-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-primary">השליטה נשארת בידיים שלכם</p>

            <h3 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              הפרופיל שלכם משפיע על איכות ההתאמה
            </h3>

            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              ככל שהפרופיל מקצועי, מפורט ומדויק יותר, כך המערכת יכולה להבין טוב יותר למי נכון להציג אותו ולהגדיל את
              הסיכוי לקבלת פניות רלוונטיות.
            </p>

            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              פנייה ממוקדת אינה מבטיחה התחלת טיפול, אך היא מגיעה לאחר שנבדקה התאמה בין הצורך שתואר לבין המידע המקצועי
              בפרופיל.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {therapistControlPoints.map((point) => (
              <div key={point} className="flex items-start gap-3 rounded-2xl bg-brand-soft/50 p-4">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-sm">
                  <Check className="h-3.5 w-3.5" />
                </div>

                <p className="text-sm leading-6 text-foreground">{point}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border-r-4 border-primary bg-brand-soft/50 p-5">
          <p className="text-base font-semibold leading-7 text-foreground">אתם לא משלמים עבור עצם ההופעה במאגר.</p>

          <p className="mt-1 text-sm leading-7 text-muted-foreground">
            התשלום קשור לפניות שהתקבלו בפועל דרך הפלטפורמה, במקום לדמי מנוי קבועים שמשולמים גם בחודשים שבהם לא התקבלו
            פניות.
          </p>
        </div>
      </div>
    </section>
  );
}

function JoinSection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-border bg-brand-soft/50 px-6 py-12 text-center shadow-sm sm:px-10 sm:py-16">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
          <Sparkles className="h-7 w-7" />
        </div>

        <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          הצטרפו למהפכה בדרך שבה אנשים מוצאים טיפול
        </h2>

        <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-muted-foreground">
          טיפולינקס היא פלטפורמה מתקדמת מבוססת בינה מלאכותית, שמקלה על אנשים למצוא את המטפל המתאים ומסייעת למטפלים לקבל
          פניות חדשות, ממוקדות ורלוונטיות יותר.
        </p>

        <p className="mx-auto mt-3 max-w-3xl text-base leading-8 text-muted-foreground">
          פתחו פרופיל מקצועי בחינם, ללא דמי מנוי וללא התחייבות מראש, והחליפו הוצאה חודשית קבועה בתשלום המבוסס על פניות
          שמתקבלות בפועל.
        </p>

        <div className="mt-8">
          <Link
            to={THERAPIST_SIGNUP_URL}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            פתיחת פרופיל מטפל בחינם
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          ללא דמי מנוי חודשיים · ללא התחייבות · אפשר להקפיא את הפרופיל בכל עת
        </p>
      </div>
    </section>
  );
}
