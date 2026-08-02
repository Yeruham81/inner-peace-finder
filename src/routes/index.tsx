import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listFilterOptions } from "@/lib/therapists.functions";
import { SearchForm } from "@/components/search-form";

const filterOptionsQuery = queryOptions({
  queryKey: ["filter-options"],
  queryFn: () => listFilterOptions(),
});

type ExplorerItem = {
  id: string;
  name: string;
  description: string;
  problems: string[];
};

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
    id: "children",
    name: "ילדים",
    description: "קשיים רגשיים, חברתיים והתנהגותיים בגיל הילדות",
    problems: [
      "פחדים וחרדות",
      "התפרצויות זעם",
      "קשיים חברתיים",
      "קשיי הסתגלות",
      "בעיות התנהגות",
      "גירושי הורים",
      "קשיי שינה",
      "קשיים בבית הספר",
    ],
  },
  {
    id: "adolescents",
    name: "בני נוער",
    description: "אתגרים חברתיים, לימודיים ומשפחתיים בגיל ההתבגרות",
    problems: [
      "חרדה חברתית",
      "קשיים בבית הספר",
      "דימוי עצמי",
      "יחסים עם ההורים",
      "בדידות",
      "חרדת מבחנים",
      "קשיים חברתיים",
      "שינויים במצב הרוח",
    ],
  },
  {
    id: "young-adults",
    name: "צעירים",
    description: "לימודים, קריירה, זוגיות וגיבוש זהות עצמאית",
    problems: [
      "בחירת מסלול לימודים",
      "תחילת קריירה",
      "קושי ביצירת קשר",
      "חרדה חברתית",
      "תחושת בדידות",
      "משבר זהות",
      "יציאה מהבית",
      "חוסר ביטחון",
    ],
  },
  {
    id: "adults",
    name: "מבוגרים",
    description: "התמודדות עם עומס, יחסים, שינויים ומשברי חיים",
    problems: ["חרדה", "דיכאון", "שחיקה", "קשיים בזוגיות", "משבר אישי", "דימוי עצמי", "בדידות", "קושי בקבלת החלטות"],
  },
  {
    id: "parents",
    name: "הורים",
    description: "הדרכה ותמיכה בהתמודדות עם אתגרי ההורות",
    problems: [
      "הצבת גבולות",
      "התפרצויות זעם",
      "יחסים בין אחים",
      "קשיים בבית הספר",
      "גיל ההתבגרות",
      "הורות לאחר גירושין",
      "שחיקה הורית",
      "תקשורת במשפחה",
    ],
  },
  {
    id: "couples",
    name: "זוגות",
    description: "שיפור התקשורת והקשר בתקופות שגרה ומשבר",
    problems: [
      "קשיי תקשורת",
      "משבר אמון",
      "ריבים חוזרים",
      "אינטימיות ומיניות",
      "מעבר להורות",
      "פרידה או גירושין",
      "פערים בצרכים",
      "התלבטות לגבי המשך הקשר",
    ],
  },
  {
    id: "families",
    name: "משפחות",
    description: "יחסים, תקשורת ושינויים המשפיעים על התא המשפחתי",
    problems: [
      "תקשורת במשפחה",
      "יחסים בין הורים לילדים",
      "יחסים בין אחים",
      "משפחה במשבר",
      "גירושין ופרידה",
      "משפחה משולבת",
      "מחלה במשפחה",
      "אובדן במשפחה",
    ],
  },
  {
    id: "older-adults",
    name: "הגיל השלישי",
    description: "שינויים, אובדן, בריאות, בדידות ומשמעות בגיל המבוגר",
    problems: [
      "בדידות",
      "אובדן ואבל",
      "פרישה מהעבודה",
      "שינויים בריאותיים",
      "חרדה",
      "דיכאון",
      "יחסים עם בני המשפחה",
      "התמודדות עם ירידה בתפקוד",
    ],
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "טיפולינקס — חיפוש חכם של מטפלים ואנשי מקצוע" },
      {
        name: "description",
        content:
          "תארו במילים שלכם מה מטריד אתכם ומצאו מטפלים ואנשי מקצוע לפי הבעיה, המיקום, שפת הטיפול, קהל היעד ואופן הטיפול.",
      },
      { property: "og:title", content: "טיפולינקס — פשוט למצוא את הטיפול שמתאים לכם" },
      {
        property: "og:description",
        content: "חיפוש חכם וגמיש של מטפלים לפי הצורך האישי שלכם.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(filterOptionsQuery);
  },
  component: Index,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-6 text-center text-foreground">
      <h1 className="text-xl font-semibold">לא הצלחנו לטעון את העמוד</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

function Index() {
  const { data: filters } = useSuspenseQuery(filterOptionsQuery);

  return (
    <main dir="rtl" className="min-h-screen bg-background">
      <section className="relative isolate overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-soft via-background to-background" />
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
              תארו במילים שלכם מה מטריד אתכם, איזה טיפול אתם מחפשים או עם איזה איש מקצוע תרצו ליצור קשר.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-4xl">
            {/* SearchForm owns the four homepage filters; no duplicate filter row is rendered in this file. */}
            <SearchForm cities={filters.cities} populations={filters.populations} languages={filters.languages} />
          </div>

          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground sm:text-sm">
            אפשר להתחיל רק מתיאור חופשי. כל הסינונים הנוספים הם אופציונליים וניתן לשנות אותם גם בעמוד התוצאות.
          </p>
        </div>
      </section>

      <ExplorerSection
        eyebrow="חיפוש לפי נושא"
        title="במה תרצו עזרה?"
        description="בחרו תחום כדי לראות נושאים נפוצים, או תארו את הצורך שלכם בחיפוש החופשי."
        items={problemDomains}
      />

      <ExplorerSection
        eyebrow="חיפוש לפי קהל"
        title="למי מיועד הטיפול?"
        description="בחרו אוכלוסייה כדי לראות צרכים ונושאים נפוצים שמאפיינים אותה."
        items={populationGroups}
        alternate
      />

      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">לא בטוחים מאיפה להתחיל?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          אתם לא חייבים לדעת מראש איך קוראים למה שאתם חווים או איזה סוג טיפול עשוי להתאים לכם. פשוט כתבו במילים שלכם מה
          מטריד אתכם או איזו עזרה אתם מחפשים, ומנוע החיפוש יעזור לכם למצוא את אנשי המקצוע המתאימים ביותר.
        </p>
        <div className="mx-auto mt-7 max-w-3xl text-right">
          <SearchForm variant="compact" />
        </div>
        <p className="mx-auto mt-3 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
          את כל אפשרויות הסינון הנוספות תוכלו לבחור ולשנות בעמוד התוצאות.
        </p>
      </section>
    </main>
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
    <section className={alternate ? "bg-brand-soft/35" : "bg-background"}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
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
                    type="button"
                    aria-expanded={isActive}
                    onClick={() => onItemClick(item.id)}
                    className={`group relative min-h-36 rounded-2xl border p-4 text-right shadow-card transition-all sm:min-h-40 sm:p-5 ${
                      isActive
                        ? "z-10 border-brand bg-brand-soft/70 ring-2 ring-brand/20"
                        : "border-border bg-surface-elevated hover:-translate-y-0.5 hover:border-brand/35"
                    } ${isDimmed ? "opacity-45 saturate-50 hover:opacity-75" : "opacity-100"}`}
                  >
                    <span className="flex h-full flex-col">
                      <span
                        className={`text-base font-bold transition-colors sm:text-lg ${
                          isActive ? "text-primary" : "text-foreground group-hover:text-primary"
                        }`}
                      >
                        {item.name}
                      </span>
                      <span className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground sm:text-sm">
                        {item.description}
                      </span>
                      <span className="mt-auto pt-4 text-xs font-semibold text-primary">
                        {isActive ? "הסתרת נושאים ↑" : "הצגת נושאים נפוצים ↓"}
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
  return (
    <div className="mt-3 rounded-3xl border border-brand/25 bg-brand-soft/35 p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <p className="text-xs font-semibold text-primary">נושאים נפוצים בתחום</p>
          <h3 className="mt-1 text-xl font-bold text-foreground">{item.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 self-start text-xs font-medium text-primary hover:underline sm:mt-0 sm:self-auto"
        >
          סגירה
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {item.problems.map((problem) => (
          <button
            key={problem}
            type="button"
            className="rounded-xl border border-border bg-surface-elevated px-3 py-3 text-sm font-medium text-foreground transition-all hover:border-brand/35 hover:bg-background hover:text-primary"
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
