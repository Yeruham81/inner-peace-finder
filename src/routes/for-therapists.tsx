import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  MessageCircleMore,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  Users,
} from "lucide-react";

const THERAPIST_SIGNUP_URL = "/auth";

export const Route = createFileRoute("/for-therapists")({
  head: () => ({
    meta: [
      { title: "טיפולינקס למטפלים | פניות ממוקדות ללא דמי מנוי" },
      {
        name: "description",
        content:
          "הצטרפו לטיפולינקס וקבלו פניות ממוקדות ממטופלים שמתאימים לתחומי העיסוק, הניסיון ושיטות הטיפול שלכם. ללא דמי מנוי חודשיים — תשלום לפי פנייה.",
      },
      {
        property: "og:title",
        content: "טיפולינקס למטפלים | יותר התאמה, פחות פניות לא רלוונטיות",
      },
      {
        property: "og:description",
        content: "טיפולינקס מבינה את הצורך שמאחורי החיפוש ומחברת בין מטופלים לבין אנשי המקצוע המתאימים להם ביותר.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForTherapistsPage,
});

const searchExamples = [
  "אני מרגיש תקוע ולא יודע איזה טיפול יכול לעזור לי",
  "אנחנו מחפשים עזרה לילד שמתקשה מבחינה חברתית",
  "אני לא בטוחה אם אני צריכה טיפול אישי או זוגי",
];

const matchingFactors = [
  "תחום מקצועי",
  "סיבת הפנייה",
  "שיטות טיפול",
  "אוכלוסיית יעד",
  "אזור ואונליין",
  "שפה",
  "העדפות המטופל",
  "ניסיון מקצועי",
];

const processSteps = [
  {
    icon: MessageCircleMore,
    number: "01",
    title: "המטופל מתאר את הצורך",
    description:
      "במקום לבחור מראש אבחנה, מקצוע או שיטת טיפול, המשתמש יכול לכתוב במילים שלו מה הוא חווה ואיזו עזרה הוא מחפש.",
  },
  {
    icon: BrainCircuit,
    number: "02",
    title: "טיפולינקס מבינה את החיפוש",
    description: "מנוע ההתאמה מזהה את הצרכים, המאפיינים וההעדפות שעולים מהתיאור ומתרגם אותם לחיפוש מקצועי וממוקד.",
  },
  {
    icon: Search,
    number: "03",
    title: "מתבצעת התאמה בין פרופילים",
    description: "החיפוש נבדק מול תחומי העיסוק, שיטות הטיפול, הניסיון, האוכלוסיות, השפות ואפשרויות הטיפול של המטפלים.",
  },
  {
    icon: Target,
    number: "04",
    title: "המטופל מגיע לאנשי המקצוע המתאימים",
    description: "המטופל מקבל רשימה ממוקדת של מטפלים שעשויים להתאים לצורך שלו ויכול לפנות ישירות למטפל שבחר.",
  },
];

const therapistBenefits = [
  {
    icon: Target,
    title: "פניות ממוקדות יותר",
    description: "הפרופיל שלכם מוצג לאנשים שהצרכים שלהם תואמים את תחומי העיסוק, הניסיון ואפשרויות הטיפול שהגדרתם.",
  },
  {
    icon: FileText,
    title: "פרופיל מקצועי ומפורט",
    description: "הציגו את ההכשרה, המקצועות, שיטות הטיפול, האוכלוסיות, הניסיון והגישה המקצועית שלכם במקום אחד.",
  },
  {
    icon: UserCheck,
    title: "חיבור המבוסס על התאמה",
    description: "החיפוש אינו מסתפק ברשימת שמות. הוא מתמקד בקשר שבין הצורך שהמטופל מתאר לבין השירות שאתם מציעים.",
  },
  {
    icon: ShieldCheck,
    title: "סביבה מקצועית ואמינה",
    description: "הפרופילים בפלטפורמה עוברים תהליך אימות, כדי לסייע למשתמשים לבחור מתוך מאגר מקצועי ואמין.",
  },
];

const profileAdvantages = [
  "הצגת כל המקצועות ותחומי העיסוק שלכם",
  "פירוט שיטות וגישות הטיפול",
  "בחירת אוכלוסיות וקבוצות גיל",
  "טיפול בקליניקה, אונליין או בשילוב ביניהם",
  "הגדרת אזורי פעילות ושפות טיפול",
  "עדכון הפרופיל בהתאם להתפתחות המקצועית שלכם",
];

function ForTherapistsPage() {
  return (
    <main dir="rtl" className="overflow-hidden bg-background">
      <HeroSection />

      <SearchProblemSection />

      <HowItWorksSection />

      <TherapistBenefitsSection />

      <PaymentSection />

      <ProfessionalProfileSection />

      <FinalCallToAction />
    </main>
  );
}

function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-gradient-to-b from-primary/10 via-background to-background"
      />

      <div
        aria-hidden="true"
        className="absolute right-[-10rem] top-[-12rem] -z-10 h-[30rem] w-[30rem] rounded-full bg-primary/10 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="absolute bottom-[-15rem] left-[-8rem] -z-10 h-[28rem] w-[28rem] rounded-full bg-primary/5 blur-3xl"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            טיפולינקס למטפלים
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl sm:leading-tight">
            מטופלים לא תמיד יודעים את מי לחפש.
            <span className="mt-2 block text-primary">טיפולינקס עוזרת להם למצוא אתכם.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            אנשים שמחפשים טיפול לא תמיד יודעים מהי האבחנה שלהם, איזה איש מקצוע הם צריכים או איזו שיטת טיפול עשויה להתאים
            להם. טיפולינקס מאפשרת להם לתאר את הצורך במילים שלהם וממקדת את החיפוש במטפלים המתאימים ביותר.
          </p>

          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            כך הפרופיל שלכם נחשף בפני אנשים שיש התאמה ממשית בין הצורך שלהם לבין השירות המקצועי שאתם מציעים.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={THERAPIST_SIGNUP_URL}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              יצירת פרופיל מטפל
              <ArrowLeft className="h-5 w-5" />
            </a>

            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background px-6 py-3 text-base font-semibold text-foreground transition hover:bg-muted"
            >
              איך ההתאמה עובדת?
            </a>
          </div>

          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              ללא דמי מנוי חודשיים
            </div>

            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              תשלום לפי פנייה
            </div>

            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              פרופילים מקצועיים מאומתים
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="rounded-3xl border border-border bg-surface-elevated p-5 shadow-xl shadow-foreground/5 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-primary">חיפוש בשפה טבעית</p>
                <h2 className="mt-1 text-xl font-bold text-foreground">לא חייבים לדעת מה לחפש</h2>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BrainCircuit className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-background p-4">
              <p className="text-sm leading-6 text-muted-foreground">
                אני מרגיש חרדה כבר כמה חודשים, מתקשה לישון ולא בטוח אם אני צריך פסיכולוג, פסיכותרפיסט או טיפול ממוקד.
              </p>
            </div>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <Sparkles className="h-5 w-5 text-primary" />
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="rounded-2xl bg-primary/10 p-4">
              <p className="text-sm font-semibold text-foreground">מנוע ההתאמה מזהה:</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {["חרדה", "קשיי שינה", "טיפול במבוגרים", "העדפה לטיפול ממוקד"].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-primary/15 bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-background p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <UserCheck className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">תוצאות מותאמות יותר</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">מתוך מאגר מטפלים מקצועיים ומאומתים</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SearchProblemSection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-sm font-semibold text-primary">לא עוד אינדקס של שמות</p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              אנשים מחפשים עזרה, לא בהכרח מקצוע
            </h2>

            <p className="mt-5 text-base leading-8 text-muted-foreground">
              מנועי חיפוש ואינדקסים רגילים דורשים מהמטופל לדעת מראש אם הוא מחפש פסיכולוג, עובד סוציאלי, מטפל זוגי,
              פסיכותרפיסט או שיטת טיפול מסוימת.
            </p>

            <p className="mt-4 text-base leading-8 text-muted-foreground">
              בפועל, רבים מתחילים את החיפוש כשהם יודעים בעיקר מה הם מרגישים: קושי בזוגיות, חרדה, משבר משפחתי, התמודדות
              של הילד או תחושה כללית שמשהו אינו כשורה.
            </p>

            <div className="mt-6 rounded-2xl border-r-4 border-primary bg-muted/50 px-5 py-4">
              <p className="font-medium leading-7 text-foreground">
                טיפולינקס נועדה לגשר בין הדרך שבה מטופלים מתארים את הקושי לבין הדרך המקצועית שבה מטפלים מגדירים את תחומי
                העיסוק שלהם.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {searchExamples.map((example) => (
              <div
                key={example}
                className="flex items-start gap-4 rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageCircleMore className="h-5 w-5" />
                </div>

                <p className="pt-1 text-base leading-7 text-foreground">„{example}”</p>
              </div>
            ))}

            <div className="flex items-center justify-center gap-3 py-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              טיפולינקס ממקדת את החיפוש לפי משמעות התיאור
            </div>
          </div>
        </div>

        <div className="mt-12 rounded-3xl border border-border bg-muted/30 p-6 sm:p-8">
          <p className="text-center text-sm font-semibold text-primary">ההתאמה יכולה להתבסס על שילוב של</p>

          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {matchingFactors.map((factor) => (
              <span
                key={factor}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm"
              >
                {factor}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 border-y border-border bg-muted/30 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">תהליך התאמה ממוקד</p>

          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            איך טיפולינקס מחברת בין מטופלים למטפלים?
          </h2>

          <p className="mt-5 text-base leading-8 text-muted-foreground">
            התהליך מתחיל בתיאור חופשי של המטופל ומסתיים בהצגת אנשי מקצוע שהפרופיל שלהם מתאים לצרכים שזוהו.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {processSteps.map((step) => {
            const Icon = step.icon;

            return (
              <article
                key={step.number}
                className="relative rounded-3xl border border-border bg-background p-6 shadow-sm"
              >
                <span className="absolute left-5 top-5 text-sm font-bold text-primary/40">{step.number}</span>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>

                <h3 className="mt-5 text-lg font-bold text-foreground">{step.title}</h3>

                <p className="mt-3 text-sm leading-7 text-muted-foreground">{step.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TherapistBenefitsSection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="text-sm font-semibold text-primary">היתרון עבורכם</p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              יותר התאמה.
              <span className="block text-primary">פחות פניות לא רלוונטיות.</span>
            </h2>

            <p className="mt-5 text-base leading-8 text-muted-foreground">
              במקום להציג את הפרופיל שלכם לכל מי שביקר באתר, טיפולינקס שואפת להציג אותו כאשר קיימת התאמה בין הצורך
              שהמשתמש תיאר לבין השירותים המקצועיים שאתם מציעים.
            </p>

            <p className="mt-4 text-base leading-8 text-muted-foreground">
              המטרה אינה לייצר כמה שיותר פניות, אלא לסייע למטופלים להגיע לאנשי המקצוע שעשויים להתאים להם באמת.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {therapistBenefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <article
                  key={benefit.title}
                  className="rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>

                  <h3 className="mt-5 text-lg font-bold text-foreground">{benefit.title}</h3>

                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{benefit.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function PaymentSection() {
  return (
    <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-foreground px-6 py-10 text-background sm:px-10 sm:py-12 lg:px-14">
          <div aria-hidden="true" className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />

          <div
            aria-hidden="true"
            className="absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-primary/15 blur-3xl"
          />

          <div className="relative grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-background/15 bg-background/10 px-4 py-2 text-sm font-medium">
                <CircleDollarSign className="h-4 w-4" />
                מודל תשלום פשוט
              </div>

              <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">ללא דמי מנוי חודשיים</h2>

              <p className="mt-5 max-w-2xl text-base leading-8 text-background/75">
                בניגוד לפלטפורמות המחייבות את המטפל בתשלום קבוע בכל חודש, ההצטרפות לטיפולינקס אינה מבוססת על דמי מנוי
                חודשיים.
              </p>

              <p className="mt-4 max-w-2xl text-lg font-medium leading-8">
                התשלום מתבצע לפי פנייה שמתקבלת ממשתמש דרך הפלטפורמה.
              </p>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-background/65">
                כך התשלום קשור ישירות לפניות שהועברו אליכם, ולא לעצם הופעת הפרופיל במאגר. מלוא התנאים והעלויות יוצגו
                למטפל לפני הפעלת הפרופיל וקבלת פניות.
              </p>
            </div>

            <div className="rounded-3xl border border-background/15 bg-background/10 p-6 backdrop-blur-sm sm:p-7">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <CircleDollarSign className="h-6 w-6" />
                </div>

                <div>
                  <p className="text-sm text-background/60">מבנה התשלום</p>
                  <p className="mt-1 text-xl font-bold">תשלום לפי פנייה</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <PaymentFeature text="אין חיוב חודשי קבוע" />
                <PaymentFeature text="אין תשלום רק עבור הופעה באינדקס" />
                <PaymentFeature text="התשלום חל כאשר מתקבלת פנייה דרך טיפולינקס" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PaymentFeature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <p className="text-sm leading-6 text-background/80">{text}</p>
    </div>
  );
}

function ProfessionalProfileSection() {
  return (
    <section className="border-y border-border bg-muted/30 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="rounded-3xl border border-border bg-background p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-4 border-b border-border pb-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="h-7 w-7" />
            </div>

            <div>
              <p className="text-sm font-medium text-primary">הפרופיל המקצועי שלכם</p>
              <p className="mt-1 text-xl font-bold text-foreground">המידע שמאפשר התאמה מדויקת יותר</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {profileAdvantages.map((advantage) => (
              <div key={advantage} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm leading-6 text-foreground">{advantage}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <BadgeCheck className="h-5 w-5" />
            פרופיל עשיר הוא בסיס להתאמה טובה
          </div>

          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            לא רק מי אתם.
            <span className="block">גם למי אתם יכולים לעזור.</span>
          </h2>

          <p className="mt-5 text-base leading-8 text-muted-foreground">
            ככל שהפרופיל שלכם מפורט ומדויק יותר, כך טיפולינקס יכולה להבין טוב יותר באילו מצבים נכון להציג אותו למשתמשים.
          </p>

          <p className="mt-4 text-base leading-8 text-muted-foreground">
            מעבר להכשרה ולתואר המקצועי, תוכלו להציג את תחומי ההתמחות, שיטות הטיפול, שנות הניסיון, האוכלוסיות שבהן אתם
            מטפלים, השפות, אזורי הפעילות ואפשרויות הטיפול מרחוק.
          </p>

          <p className="mt-4 text-base leading-8 text-muted-foreground">
            המידע הזה מסייע למטופלים להבין מדוע אתם עשויים להתאים להם, ומאפשר להם לפנות אליכם מתוך בחירה מושכלת יותר.
          </p>
        </div>
      </div>
    </section>
  );
}

function FinalCallToAction() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-4xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BadgeCheck className="h-7 w-7" />
        </div>

        <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          הציגו את המקצועיות שלכם למטופלים המתאימים
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
          צרו פרופיל מקצועי, הגדירו במדויק את תחומי העיסוק שלכם ואפשרו לטיפולינקס לחבר ביניכם לבין אנשים שמחפשים את
          העזרה שאתם יודעים להעניק.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={THERAPIST_SIGNUP_URL}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto"
          >
            הצטרפות לטיפולינקס
            <ArrowLeft className="h-5 w-5" />
          </a>

          <a
            href="#how-it-works"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-border bg-background px-7 py-3 text-base font-semibold text-foreground transition hover:bg-muted sm:w-auto"
          >
            קראו איך זה עובד
          </a>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          ללא דמי מנוי חודשיים · תשלום לפי פנייה שמתקבלת דרך הפלטפורמה
        </p>
      </div>
    </section>
  );
}
