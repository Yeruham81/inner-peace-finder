import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
    id: "infants",
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

const popularSearches = [
  "טיפול לחרדה חברתית בגיל ההתבגרות",
  "מטפלת זוגית מנוסה באזור השרון",
  "קלינאית תקשורת מומחית להפרעות דיבור בפעוטות בפתח תקווה",
  "פסיכולוג ילדים לקשיי קשב וריכוז בתל אביב",
  "טיפול אונליין בעברית להתמודדות עם דיכאון",
  "מטפל בטראומה ופוסט־טראומה באזור ירושלים",
  "פסיכולוגית דוברת רוסית לנשים אחרי לידה באזור חיפה",
  "הדרכת הורים לילדים עם התפרצויות זעם באזור המרכז",
  "עובד סוציאלי לטיפול באבל ובאובדן לגיל השלישי בבאר שבע",
  "טיפול משפחתי בבית למשפחה במשבר באזור הצפון",
  "מטפלת בהפרעות אכילה לצעירות באזור תל אביב",
  "טיפול זוגי אונליין באנגלית",
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
      {
        property: "og:title",
        content: "טיפולינקס — פשוט למצוא את הטיפול שמתאים לכם",
      },
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
              תארו במילים שלכם מה מטריד אתכם, איזה טיפול אתם מחפשים או עם איזה איש מקצוע תרצו ליצור קשר
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-4xl">
            {/* SearchForm owns the four homepage filters; no duplicate filter row is rendered in this file. */}
            <SearchForm cities={filters.cities} populations={filters.populations} languages={filters.languages} />
          </div>

          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground sm:text-sm">
            אפשר להתחיל רק מתיאור חופשי. הסינונים הנוספים הם אופציונליים וניתנים לשינוי&nbsp;בעמוד התוצאות
          </p>

          <PopularSearches />
        </div>
      </section>

      <ExplorerSection
        eyebrow="חיפוש לפי נושא"
        title="באיזה תחום אתם מחפשים טיפול?"
        description=""
        items={problemDomains}
      />

      <ExplorerSection
        eyebrow="חיפוש לפי אוכלוסייה"
        title="למי מיועד הטיפול?"
        description=""
        items={populationGroups}
        alternate
      />

      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">לא בטוחים מאיפה להתחיל?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          אתם לא חייבים לדעת איך קוראים לבעיה שלכם או איזה סוג טיפול עשוי לעזור לכם. פשוט תארו מה מטריד אתכם או איזו
          עזרה אתם מחפשים, ומנוע החיפוש ימצא לכם את אנשי המקצוע המתאימים ביותר
        </p>
        <div className="mx-auto mt-7 max-w-3xl text-right">
          <SearchForm variant="simple" />
        </div>
        <p className="mx-auto mt-3 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
          את כל אפשרויות הסינון הנוספות תוכלו לבחור ולשנות בעמוד התוצאות
        </p>
      </section>
    </main>
  );
}

function PopularSearches() {
  const navigate = useNavigate();

  function startSearch(query: string) {
    navigate({
      to: "/search",
      search: { q: query },
    });
  }

  return (
    <div className="mx-auto mt-8 max-w-4xl border-t border-border/60 pt-7 text-center">
      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">חיפושים נפוצים</h2>

      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        {popularSearches.map((query) => (
          <button
            key={query}
            type="button"
            aria-label={`חיפוש ישיר: ${query}`}
            onClick={() => startSearch(query)}
            className="inline-flex cursor-pointer items-center justify-center rounded-full border border-brand/20 bg-surface-elevated px-4 py-2.5 text-center text-sm font-semibold leading-5 text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-brand-soft/70 hover:text-primary hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
          >
            {query}
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
          <p className="text-sm font-semibold text-primary">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
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
                    type="button"
                    aria-expanded={isActive}
                    onClick={() => onItemClick(item.id)}
                    className={`group relative min-h-36 cursor-pointer rounded-2xl border p-4 text-center shadow-card transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 sm:min-h-40 sm:p-5 ${
                      isActive
                        ? "z-10 -translate-y-0.5 border-brand bg-brand-soft/70 shadow-lg ring-2 ring-brand/20"
                        : "border-border bg-surface-elevated hover:-translate-y-1 hover:border-brand/50 hover:bg-brand-soft/35 hover:shadow-lg"
                    } ${isDimmed ? "opacity-45 saturate-50 hover:opacity-90 hover:saturate-100" : "opacity-100"}`}
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
  const populationSlug = populationGroups.some((group) => group.id === item.id) ? item.id : undefined;

  function startSearch(problem: string) {
    navigate({
      to: "/search",
      search: {
        q: problem,
        population: populationSlug,
      },
    });
  }

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
