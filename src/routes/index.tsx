import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listFilterOptions } from "@/lib/therapists.functions";
import { SearchForm } from "@/components/search-form";
import { homepageProblemSlugs } from "@/lib/homepage-problem-map";
import { HOMEPAGE_SEARCH_PRESETS, type HomepageSearchPreset } from "@/lib/homepage-search-presets";
import { serializeMultiValue } from "@/lib/search-contract";
import { absoluteUrl, serializeJsonLd, SITE_NAME, SITE_ORIGIN } from "@/lib/seo";

const filterOptionsQuery = queryOptions({
  queryKey: ["filter-options"],
  queryFn: () => listFilterOptions(),
});

type ExplorerItem = {
  id: string;
  name: string;
  description: string;
  problems: string[];
  populationSlug?: PopulationSlug;
};

type PopulationSlug =
  | "infants"
  | "children"
  | "adolescents"
  | "young-adults"
  | "adults"
  | "older-adults"
  | "couples"
  | "parents-families";

const problemDomains: ExplorerItem[] = [
  {
    id: "anxiety-fears",
    name: "חרדה ופחדים",
    description: "דאגנות, פאניקה, פוביות ופחדים שמגבילים את היום־יום",
    problems: [
      "חרדה חברתית",
      "התקפי פאניקה",
      "חרדת בריאות",
      "פחד מטיסה",
      "פוביות",
      "דאגנות יתר",
      "חרדת מבחנים",
      "מחשבות טורדניות",
    ],
  },
  {
    id: "mood-depression",
    name: "מצב רוח ודיכאון",
    description: "עצב מתמשך, חוסר אנרגיה, בדידות ואובדן עניין",
    problems: [
      "דיכאון",
      "מצב רוח ירוד",
      "בדידות",
      "חוסר מוטיבציה",
      "תחושת ריקנות",
      "קשיי שינה",
      "ייאוש",
      "שינויים חדים במצב הרוח",
    ],
  },
  {
    id: "relationships",
    name: "זוגיות ומערכות יחסים",
    description: "קשיים בתקשורת, באינטימיות ובקשרים קרובים",
    problems: [
      "משבר בזוגיות",
      "קשיי תקשורת",
      "פרידה וגירושין",
      "קנאה וחוסר אמון",
      "אינטימיות ומיניות",
      "קושי ביצירת קשר",
      "תלות רגשית",
      "מערכות יחסים פוגעניות",
    ],
  },
  {
    id: "trauma-crisis",
    name: "טראומה ומשברי חיים",
    description: "התמודדות עם אירועים קשים, אובדן ושינויים משמעותיים",
    problems: [
      "פוסט טראומה",
      "אובדן ואבל",
      "משבר אישי",
      "מחלה או פציעה",
      "פגיעה מינית",
      "אלימות",
      "שינוי משמעותי בחיים",
      "התמודדות לאחר אירוע ביטחוני",
    ],
  },
  {
    id: "children-family",
    name: "ילדים, הורות ומשפחה",
    description: "אתגרים רגשיים והתנהגותיים בבית, בגן ובבית הספר",
    problems: [
      "קשיים חברתיים",
      "התפרצויות זעם",
      "הדרכת הורים",
      "קשיי הסתגלות",
      "פחדים אצל ילדים",
      "יחסים בין אחים",
      "גירושי הורים",
      "קשיים בבית הספר",
    ],
  },
  {
    id: "work-study-burnout",
    name: "עבודה, לימודים ושחיקה",
    description: "לחץ, עומס, חוסר מיקוד וקושי בתפקוד מקצועי או לימודי",
    problems: [
      "שחיקה בעבודה",
      "לחץ בעבודה",
      "חרדת מבחנים",
      "דחיינות",
      "קשיי ריכוז",
      "בחירת קריירה",
      "חוסר ביטחון מקצועי",
      "איזון בין עבודה לחיים",
    ],
  },
  {
    id: "self-growth",
    name: "דימוי עצמי והתפתחות אישית",
    description: "ביטחון עצמי, זהות, הצבת גבולות ותחושת מימוש",
    problems: [
      "דימוי עצמי נמוך",
      "חוסר ביטחון",
      "קושי בהצבת גבולות",
      "ריצוי אחרים",
      "קבלת החלטות",
      "משבר זהות",
      "תחושת תקיעות",
      "התפתחות אישית",
    ],
  },
  {
    id: "eating-body-habits",
    name: "אכילה, גוף והרגלים",
    description: "יחסים עם אוכל ועם הגוף, התמכרויות והרגלים שקשה לשנות",
    problems: [
      "אכילה רגשית",
      "הפרעות אכילה",
      "דימוי גוף",
      "התמכרויות",
      "עישון",
      "שימוש באלכוהול",
      "הרגלים כפייתיים",
      "קושי בשינוי הרגלים",
    ],
  },
];

const populationGroups: ExplorerItem[] = [
  {
    id: "infants",
    populationSlug: "infants",
    name: "תינוקות ופעוטות",
    description: "גילאי 0–5",
    problems: [
      "קשיי שינה",
      "קשיי אכילה",
      "קשיי פרידה",
      "ויסות רגשי",
      "עיכוב התפתחותי",
      "התפרצויות והתנהגות מאתגרת",
      "הסתגלות למסגרת",
      "הדרכת הורים",
    ],
  },
  {
    id: "children",
    populationSlug: "children",
    name: "ילדים",
    description: "גילאי 6–12",
    problems: [
      "חרדה ופחדים",
      "קשיים חברתיים",
      "קשיי קשב וריכוז",
      "התפרצויות וכעסים",
      "דימוי עצמי נמוך",
      "קשיים בבית הספר",
      "התמודדות עם גירושי הורים",
      "קשיי הסתגלות",
    ],
  },
  {
    id: "adolescents",
    populationSlug: "adolescents",
    name: "בני נוער",
    description: "גילאי 13–17",
    problems: [
      "חרדה חברתית",
      "דימוי עצמי",
      "דיכאון ושינויים במצב הרוח",
      "חרדת מבחנים",
      "קשיים חברתיים ובדידות",
      "יחסים עם ההורים",
      "הפרעות אכילה",
      "לחץ לימודי",
    ],
  },
  {
    id: "young-adults",
    populationSlug: "young-adults",
    name: "צעירים",
    description: "גילאי 18–30",
    problems: [
      "חרדה ולחץ",
      "זוגיות ומערכות יחסים",
      "לימודים וקריירה",
      "זהות וכיוון בחיים",
      "דימוי עצמי",
      "בדידות וקשיים חברתיים",
      "פרידות ומשברים",
      "עצמאות ומעבר לחיים בוגרים",
    ],
  },
  {
    id: "adults",
    populationSlug: "adults",
    name: "מבוגרים",
    description: "גילאי 31–64",
    problems: [
      "חרדה ודאגנות",
      "דיכאון ומצב רוח ירוד",
      "שחיקה ולחץ בעבודה",
      "משברים אישיים",
      "קשיים בזוגיות",
      "דימוי עצמי",
      "טראומה ואובדן",
      "שינויי חיים",
    ],
  },
  {
    id: "older-adults",
    populationSlug: "older-adults",
    name: "הגיל השלישי",
    description: "גילאי 65 ומעלה",
    problems: [
      "בדידות",
      "אובדן ואבל",
      "דיכאון וחרדה",
      "הסתגלות לפרישה",
      "שינויים בריאותיים",
      "ירידה בתפקוד",
      "יחסים במשפחה",
      "משמעות ואיכות חיים",
    ],
  },
  {
    id: "couples",
    populationSlug: "couples",
    name: "זוגות",
    description: "טיפול זוגי ומערכות יחסים",
    problems: [
      "קשיי תקשורת",
      "משבר בזוגיות",
      "בגידה ואובדן אמון",
      "אינטימיות ומיניות",
      "קונפליקטים חוזרים",
      "פרידה וגירושין",
      "הורות משותפת",
      "הכנה לנישואין",
    ],
  },
  {
    id: "parents-families",
    populationSlug: "parents-families",
    name: "הורים ומשפחות",
    description: "הדרכת הורים וטיפול משפחתי",
    problems: [
      "הדרכת הורים",
      "יחסי הורים וילדים",
      "מריבות וקונפליקטים במשפחה",
      "קשיים בין אחים",
      "גירושין ומשפחה בתהליך שינוי",
      "משפחות משולבות",
      "התמודדות עם ילד במשבר",
      "טיפול משפחתי",
    ],
  },
];

const popularSearches = HOMEPAGE_SEARCH_PRESETS;

export const Route = createFileRoute("/")({
  head: () => {
    const canonical = absoluteUrl("/");
    return {
      meta: [
        { title: "טיפולינקס — חיפוש חכם של מטפלים ואנשי מקצוע" },
        {
          name: "description",
          content:
            "תארו במילים שלכם מה מטריד אתכם ומצאו מטפלים ואנשי מקצוע לפי הבעיה, המיקום, שפת הטיפול, קהל היעד ואופן הטיפול.",
        },
        {
          property: "og:title",
          content: "טיפולינקס — פשוט למצוא את הטיפול שמתאים לכם",
        },
        {
          property: "og:description",
          content: "חיפוש חכם וגמיש של מטפלים לפי הצורך האישי שלכם.",
        },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: serializeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": `${SITE_ORIGIN}/#organization`,
                name: SITE_NAME,
                alternateName: "Tipulinks",
                url: canonical,
                description: "פלטפורמה לחיפוש מטפלים ואנשי מקצוע לפי הצורך, המיקום, שפת הטיפול, קהל היעד ואופן הטיפול.",
              },
              {
                "@type": "WebSite",
                "@id": `${SITE_ORIGIN}/#website`,
                name: SITE_NAME,
                alternateName: "Tipulinks",
                url: canonical,
                inLanguage: "he-IL",
                publisher: { "@id": `${SITE_ORIGIN}/#organization` },
              },
            ],
          }),
        },
      ],
    };
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(filterOptionsQuery);
  },
  component: Index,
  errorComponent: () => (
    <div className="mx-auto max-w-2xl p-6 text-center text-foreground">
      <h1 className="text-xl font-semibold">לא הצלחנו לטעון את העמוד</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        אירעה שגיאה זמנית בטעינת אפשרויות החיפוש. נסו לרענן את העמוד.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
      >
        רענון העמוד
      </button>
    </div>
  ),
});

function Index() {
  const { data: filters } = useSuspenseQuery(filterOptionsQuery);

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-soft/50 via-background to-brand-soft/50">
      <section className="relative isolate overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-surface-elevated px-4 py-1.5 text-xs font-medium text-primary shadow-card">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              חיפוש חכם של מטפלים ואנשי מקצוע
            </span>

            <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
              פשוט למצוא את הטיפול שמתאים לכם
            </h1>

            <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              תארו במילים שלכם מה מטריד אתכם, מהו הטיפול המבוקש או איזה איש מקצוע אתם מחפשים
            </p>

            <p className="mx-auto mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
              אין צורך להזין שם, פרטי קשר או כל מידע מזהה אחר
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-4xl">
            {/* SearchForm owns the four homepage filters; no duplicate filter row is rendered in this file. */}
            <SearchForm
              cities={filters.cities}
              cityRegions={filters.cityRegions}
              populations={filters.populations}
              languages={filters.languages}
            />
          </div>

          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground sm:text-sm">
            אפשר להתחיל מתיאור חופשי. מסננים נוספים בעמוד התוצאות
          </p>

          <PopularSearches />
        </div>
      </section>

      <ExplorerSection eyebrow="" title="חיפוש לפי נושא" description="" items={problemDomains} />

      <ExplorerSection eyebrow="" title="חיפוש לפי אוכלוסייה" description="" items={populationGroups} alternate />

      <HowItWorks />

      <TrustSection />

      <ChoosingTherapistSection />

      <FrequentlyAskedQuestions />

      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">לא בטוחים מאיפה להתחיל?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          אתם לא חייבים לדעת איך קוראים לבעיה או איזה סוג טיפול עשוי להתאים. פשוט תארו מה מטריד אתכם או איזו עזרה אתם
          מחפשים, והחיפוש יציג אנשי מקצוע רלוונטיים לפי התיאור שלכם
        </p>
        <div className="mx-auto mt-7 max-w-3xl text-right">
          <SearchForm variant="simple" />
        </div>
        <p className="mx-auto mt-3 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
          את כל אפשרויות הסינון הנוספות תוכלו לבחור ולשנות בעמוד התוצאות
        </p>
      </section>

      <CrisisNotice />
    </main>
  );
}

const howItWorksSteps = [
  {
    number: "1",
    title: "מתארים את הטיפול שמחפשים",
    description: "כותבים במילים שלכם מה מטריד אתכם, או מתחילים מבחירת נושא או אוכלוסייה.",
  },
  {
    number: "2",
    title: "בוחרים מתוך מאגר המטפלים",
    description: "משווים בין פרופילים רלוונטיים לפי התיאור והסינונים שבחרתם.",
  },
  {
    number: "3",
    title: "יוצרים קשר ומתאמים טיפול",
    description: "פונים ישירות לאיש או לאשת המקצוע שבחרתם ומבררים את המשך התהליך.",
  },
];

function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="how-it-works-title">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold text-primary">שלושה צעדים פשוטים</p>
        <h2 id="how-it-works-title" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          איך החיפוש בטיפולינקס עובד?
        </h2>
      </div>

      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {howItWorksSteps.map((step) => (
          <li
            key={step.number}
            className="rounded-2xl border border-border bg-surface-elevated p-6 text-center shadow-card"
          >
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-base font-bold text-primary">
              {step.number}
            </span>
            <h3 className="mt-4 text-lg font-bold text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const trustItems = [
  {
    title: "מידע ברור ומפורט",
    description: "סננו לפי מגוון רחב של פרמטרים כדי למצוא את המטפלים המתאימים לכם ביותר.\u00a0",
  },
  {
    title: "שקיפות מקצועית",
    description: 'חפשו את הסימון "מאומת" בפרופילים של מטפלים שהסמכתם אומתה ע"י צוות האתר.\u00a0',
  },
  {
    title: "חיפוש ללא התחייבות",
    description: "עיינו בפרופילים והחליטו עם איזה מטפלים אתם מעוניינים ליצור קשר.",
  },
];

function TrustSection() {
  return (
    <section className="border-y border-border/60 bg-surface-elevated/35" aria-labelledby="trust-title">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">כל המידע במקום אחד</p>
          <h2 id="trust-title" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            בודקים, משווים ומחליטים
          </h2>
        </div>

        <div className="mx-auto mt-8 max-w-4xl rounded-3xl border border-border bg-surface-elevated p-6 shadow-card sm:p-8">
          <ul className="grid gap-6 text-right md:grid-cols-3">
            {trustItems.map((item) => (
              <li key={item.title} className="relative pr-7">
                <span aria-hidden="true" className="absolute right-0 top-2 h-3 w-3 rounded-full bg-brand" />
                <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ChoosingTherapistSection() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20" aria-labelledby="choosing-title">
      <p className="text-sm font-semibold text-primary">בחירה שמתאימה לכם</p>
      <h2 id="choosing-title" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        מה כדאי לבדוק כשבוחרים מטפל?
      </h2>
      <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
        בדקו את תחומי הניסיון, האוכלוסיות שבהן המטפל עוסק, שפת הטיפול, המיקום ואפשרויות הטיפול מרחוק. לצד ההתאמה
        המקצועית, חשוב שתרגישו בנוח לשאול שאלות ולהבין כיצד התהליך צפוי להתנהל.
      </p>
    </section>
  );
}

const frequentlyAskedQuestions = [
  {
    question: "האם צריך לדעת מראש איזה סוג טיפול לחפש?",
    answer: "לא. אפשר להתחיל מתיאור חופשי של מה שמטריד אתכם, גם בלי להכיר שמות של שיטות טיפול או מקצועות.",
  },
  {
    question: "כיצד נקבעות התוצאות?",
    answer: "החיפוש משקלל את התיאור שכתבתם ואת הסינונים שבחרתם כדי להציג פרופילים רלוונטיים.",
  },
  {
    question: "האם אפשר לשנות את הסינונים לאחר החיפוש?",
    answer: "כן. ניתן להוסיף, להסיר ולשנות את הסינונים בעמוד התוצאות.",
  },
  {
    question: "האם אפשר למצוא טיפול אונליין?",
    answer: "כן. אפשר לבחור טיפול אונליין בסינוני החיפוש ולראות אנשי מקצוע שמציעים שירות זה.",
  },
];

function FrequentlyAskedQuestions() {
  return (
    <section className="border-y border-border/60 bg-surface-elevated/35" aria-labelledby="faq-title">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <p className="text-sm font-semibold text-primary">מידע שימושי לפני שמתחילים</p>
          <h2 id="faq-title" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            שאלות נפוצות
          </h2>
        </div>

        <dl className="mt-8 space-y-3">
          {frequentlyAskedQuestions.map((item) => (
            <div
              key={item.question}
              className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm sm:p-6"
            >
              <dt className="text-base font-bold text-foreground sm:text-lg">{item.question}</dt>
              <dd className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function CrisisNotice() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <aside className="border-t border-border/60 bg-background" aria-labelledby="crisis-notice-title">
        <div className="mx-auto max-w-5xl px-4 py-8 text-center sm:px-6">
          <h2 id="crisis-notice-title" className="text-sm font-bold text-foreground">
            זקוקים לעזרה מיידית?
          </h2>
          <p className="mx-auto mt-2 max-w-3xl text-xs leading-5 text-muted-foreground sm:text-sm">
            טיפולינקס מסייע במציאת מטפלים ואינו מיועד למצבי חירום. במקרה של סכנה מיידית או מצוקה חריפה, יש לפנות לשירותי
            החירום או ל
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="font-semibold text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
            >
              מוקד סיוע מתאים
            </button>
            .
          </p>
        </div>
      </aside>

      {isOpen ? <SupportHotlinesModal onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

type SupportHotline = {
  name: string;
  phone: string;
  description: string;
  href?: string;
  phoneLinks?: Array<{ label: string; href: string }>;
};

const supportHotlines: SupportHotline[] = [
  {
    name: "ער״ן — עזרה ראשונה נפשית",
    phone: "1201",
    href: "tel:1201",
    description: "סיוע נפשי ותמיכה רגשית אנונימית לכל אדם, בכל גיל ובכל סוג של מצוקה.",
  },
  {
    name: "נט״ל",
    phone: "1-800-363-363",
    href: "tel:1800363363",
    description: "סיוע לנפגעות ולנפגעי טראומה על רקע מלחמה וטרור ולבני משפחותיהם.",
  },
  {
    name: "מוקד משרד הרווחה",
    phone: "118",
    href: "tel:118",
    description: "מידע וסיוע במצבי אלימות במשפחה, פגיעה, הזנחה ומצבי חירום חברתיים.",
  },
  {
    name: "מרכזי הסיוע לנפגעות ולנפגעי תקיפה מינית",
    phone: "1202 / 1203",
    phoneLinks: [
      { label: "1202 — מענה על ידי נשים", href: "tel:1202" },
      { label: "1203 — מענה על ידי גברים", href: "tel:1203" },
    ],
    description: "סיוע אנונימי לנפגעות ולנפגעי פגיעה מינית, לפי העדפת מגדר המסייעת או המסייע.",
  },
  {
    name: "שירותי החירום",
    phone: "100 / 101",
    phoneLinks: [
      { label: "100 — משטרת ישראל", href: "tel:100" },
      { label: "101 — מגן דוד אדום", href: "tel:101" },
    ],
    description: "במקרה של סכנה מיידית, איום על החיים או צורך רפואי דחוף.",
  },
];

function SupportHotlinesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-hotlines-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-background p-5 text-right shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="support-hotlines-title" className="text-xl font-bold text-foreground sm:text-2xl">
              מוקדי סיוע וחירום
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">בחרו במוקד המתאים למצב ולחצו על המספר לחיוג.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירת חלון מוקדי הסיוע"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-xl text-foreground hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
          >
            ×
          </button>
        </div>

        <ul className="mt-6 space-y-3">
          {supportHotlines.map((hotline) => (
            <li key={hotline.name} className="rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
              <h3 className="font-bold text-foreground">{hotline.name}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{hotline.description}</p>
              {hotline.phoneLinks ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {hotline.phoneLinks.map((phoneLink) => (
                    <a
                      key={phoneLink.href}
                      href={phoneLink.href}
                      className="inline-flex min-h-11 items-center rounded-xl border border-brand/25 bg-brand-soft px-4 py-2 text-sm font-bold text-primary hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
                    >
                      {phoneLink.label}
                    </a>
                  ))}
                </div>
              ) : (
                <a
                  href={hotline.href}
                  className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-brand/25 bg-brand-soft px-4 py-2 text-base font-bold text-primary hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
                >
                  {hotline.phone}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PopularSearches() {
  const navigate = useNavigate();

  function startSearch(preset: HomepageSearchPreset) {
    navigate({
      to: "/search",
      search: preset.search,
    });
  }

  return (
    <div className="mx-auto mt-8 max-w-5xl border-t border-border/60 pt-7 text-center">
      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">חיפושים לדוגמה</h2>

      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:hidden">
        {popularSearches.slice(0, 6).map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-label={`חיפוש ישיר: ${preset.label}`}
            onClick={() => startSearch(preset)}
            className="flex min-h-[4.75rem] w-full cursor-pointer items-center justify-center rounded-2xl border border-brand/20 bg-surface-elevated px-3 py-2.5 text-center text-sm font-semibold leading-5 text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-brand-soft/70 hover:text-primary hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
          >
            <span className="line-clamp-3">{preset.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 hidden grid-cols-4 gap-3 lg:grid">
        {popularSearches.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-label={`חיפוש ישיר: ${preset.label}`}
            onClick={() => startSearch(preset)}
            className="flex min-h-[4.5rem] w-full cursor-pointer items-center justify-center rounded-2xl border border-brand/20 bg-surface-elevated px-4 py-2.5 text-center text-sm font-semibold leading-5 text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-brand-soft/70 hover:text-primary hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
          >
            <span className="line-clamp-2">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type ExplorerSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  items: ExplorerItem[];
  alternate?: boolean;
};

function ExplorerSection({ eyebrow, title, description, items, alternate = false }: ExplorerSectionProps) {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  return (
    <section className={alternate ? "border-y border-border/60 bg-surface-elevated/35" : "bg-transparent"}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          {eyebrow ? <p className="text-sm font-semibold text-primary">{eyebrow}</p> : null}
          <h2 className={`${eyebrow ? "mt-2" : ""} text-2xl font-bold tracking-tight text-foreground sm:text-3xl`}>
            {title}
          </h2>
          {description ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
          ) : null}
        </div>

        {/* Two cards per row on smaller screens. The active panel is inserted directly below its row. */}
        <div className="mt-8 lg:hidden">
          <ExplorerRows
            items={items}
            columns={2}
            activeItemId={activeItemId}
            onItemClick={(itemId) => setActiveItemId((current) => (current === itemId ? null : itemId))}
            onClose={() => setActiveItemId(null)}
          />
        </div>

        {/* Four cards per row on desktop, with the dependent problems immediately below that row. */}
        <div className="mt-8 hidden lg:block">
          <ExplorerRows
            items={items}
            columns={4}
            activeItemId={activeItemId}
            onItemClick={(itemId) => setActiveItemId((current) => (current === itemId ? null : itemId))}
            onClose={() => setActiveItemId(null)}
          />
        </div>
      </div>
    </section>
  );
}

type ExplorerRowsProps = {
  items: ExplorerItem[];
  columns: 2 | 4;
  activeItemId: string | null;
  onItemClick: (itemId: string) => void;
  onClose: () => void;
};

function ExplorerRows({ items, columns, activeItemId, onItemClick, onClose }: ExplorerRowsProps) {
  const rows = chunkItems(items, columns);

  return (
    <div className="space-y-3">
      {rows.map((row, rowIndex) => {
        const activeItemInRow = row.find((item) => item.id === activeItemId);

        return (
          <div key={`${columns}-${rowIndex}`}>
            <div className={`grid gap-3 ${columns === 4 ? "grid-cols-4" : "grid-cols-2"}`}>
              {row.map((item) => {
                const isActive = item.id === activeItemId;
                const isDimmed = activeItemId !== null && !isActive;

                return (
                  <button
                    key={item.id}
                    id={`explorer-button-${item.id}`}
                    type="button"
                    aria-expanded={isActive}
                    aria-controls={`explorer-panel-${item.id}`}
                    onClick={() => onItemClick(item.id)}
                    className={`group relative min-h-36 cursor-pointer rounded-2xl border p-4 text-center shadow-card transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 sm:min-h-40 sm:p-5 ${
                      isActive
                        ? "z-10 -translate-y-0.5 border-brand bg-brand-soft/70 shadow-lg ring-2 ring-brand/20"
                        : "border-border bg-surface-elevated hover:-translate-y-1 hover:border-brand/50 hover:bg-brand-soft/35 hover:shadow-lg"
                    } ${isDimmed ? "opacity-70 hover:opacity-100" : "opacity-100"}`}
                  >
                    <span className="flex h-full flex-col items-center justify-center">
                      <span
                        className={`text-lg font-bold leading-snug transition-colors sm:text-xl ${
                          isActive ? "text-primary" : "text-foreground group-hover:text-primary"
                        }`}
                      >
                        {item.name}
                      </span>
                      <span className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground sm:text-base">
                        {item.description}
                      </span>
                    </span>

                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-[11px] left-1/2 z-20 h-5 w-5 -translate-x-1/2 rotate-45 border-b border-r border-brand/30 bg-brand-soft"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {activeItemInRow && <ExplorerProblemPanel item={activeItemInRow} onClose={onClose} />}
          </div>
        );
      })}
    </div>
  );
}

function ExplorerProblemPanel({ item, onClose }: { item: ExplorerItem; onClose: () => void }) {
  const navigate = useNavigate();
  const populationSlug = item.populationSlug;

  function startSearch(problem: string) {
    const problemSlugs = homepageProblemSlugs(problem);

    navigate({
      to: "/search",
      search: {
        q: problem,
        problem: serializeMultiValue(problemSlugs),
        population: populationSlug,
      },
    });
  }

  return (
    <div
      id={`explorer-panel-${item.id}`}
      role="region"
      aria-labelledby={`explorer-button-${item.id}`}
      className="mt-3 rounded-3xl border border-brand/25 bg-brand-soft/35 p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <p className="text-xs font-semibold text-primary">נושאים נפוצים בתחום</p>
          <h3 className="mt-1 text-xl font-bold text-foreground">{item.name}</h3>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 inline-flex min-h-11 items-center self-start rounded-lg px-3 text-sm font-medium text-primary hover:bg-brand-soft hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 sm:mt-0 sm:self-auto"
        >
          סגירה
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {item.problems.map((problem) => (
          <button
            key={problem}
            type="button"
            onClick={() => startSearch(problem)}
            className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-border bg-surface-elevated px-4 py-3 text-center text-base font-semibold leading-6 text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-brand-soft/60 hover:text-primary hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
          >
            {problem}
          </button>
        ))}
      </div>
    </div>
  );
}

function chunkItems(items: ExplorerItem[], size: number): ExplorerItem[][] {
  const rows: ExplorerItem[][] = [];

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }

  return rows;
}
