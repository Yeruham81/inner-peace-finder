import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listFilterOptions } from "@/lib/therapists.functions";
import { SearchForm } from "@/components/search-form";

const filterOptionsQuery = queryOptions({
  queryKey: ["filter-options"],
  queryFn: () => listFilterOptions(),
});

type QuickFilterKey = "location" | "language" | "population" | "serviceType";

type QuickFilter = {
  key: QuickFilterKey;
  label: string;
  placeholder: string;
  options: string[];
};

type ExplorerItem = {
  id: string;
  name: string;
  description: string;
  problems: string[];
};

const quickFilters: QuickFilter[] = [
  {
    key: "location",
    label: "אזור או עיר",
    placeholder: "כל הארץ",
    options: ["תל אביב", "ירושלים", "חיפה", "באר שבע", "השרון", "השפלה", "הצפון", "הדרום"],
  },
  {
    key: "language",
    label: "שפת הטיפול",
    placeholder: "כל השפות",
    options: ["עברית", "אנגלית", "רוסית", "ערבית", "צרפתית", "ספרדית", "אמהרית", "יידיש"],
  },
  {
    key: "population",
    label: "למי מיועד הטיפול",
    placeholder: "כל האוכלוסיות",
    options: ["ילדים", "בני נוער", "צעירים", "מבוגרים", "הורים", "זוגות", "משפחות", "הגיל השלישי"],
  },
  {
    key: "serviceType",
    label: "אופן הטיפול",
    placeholder: "כל האפשרויות",
    options: ["פגישה בקליניקה", "טיפול אונליין", "ביקור בית", "טיפול קבוצתי"],
  },
];

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
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-soft via-background to-background" />
        <div className="mx-auto max-w-5xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-surface-elevated px-4 py-1.5 text-xs font-medium text-primary shadow-card">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              חיפוש חכם של מטפלים ואנשי מקצוע
            </span>

            <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
              מצאו את הטיפול שמתאים לכם
            </h1>

            <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              תארו במילים שלכם מה מטריד אתכם, איזה טיפול אתם מחפשים או עם איזה איש מקצוע תרצו לדבר.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-4xl rounded-3xl border border-border bg-surface-elevated p-3 shadow-card sm:p-5">
            <SearchForm cities={filters.cities} populations={filters.populations} languages={filters.languages} />
            <QuickFilterBar />
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
          אין צורך לדעת מראש מה שם הבעיה או איזה סוג טיפול מתאים. כתבו במילים שלכם מה אתם מרגישים או מחפשים, וטיפולינקס
          יעזור למקד את האפשרויות.
        </p>
      </section>
    </main>
  );
}

function QuickFilterBar() {
  const [openFilter, setOpenFilter] = useState<QuickFilterKey | null>(null);
  const [selectedValues, setSelectedValues] = useState<Partial<Record<QuickFilterKey, string>>>({});

  const activeFilter = quickFilters.find((filter) => filter.key === openFilter);

  const selectOption = (key: QuickFilterKey, value: string) => {
    setSelectedValues((current) => ({ ...current, [key]: value }));
    setOpenFilter(null);
  };

  const clearOption = (key: QuickFilterKey) => {
    setSelectedValues((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="mt-3 border-t border-border pt-3 sm:mt-4 sm:pt-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {quickFilters.map((filter) => {
          const selectedValue = selectedValues[filter.key];
          const isOpen = openFilter === filter.key;

          return (
            <button
              key={filter.key}
              type="button"
              aria-expanded={isOpen}
              aria-controls="homepage-quick-filter-options"
              onClick={() => setOpenFilter(isOpen ? null : filter.key)}
              className={`min-w-0 rounded-2xl border px-3 py-3 text-right transition-all sm:px-4 ${
                isOpen
                  ? "border-brand bg-brand-soft shadow-sm"
                  : selectedValue
                    ? "border-brand/30 bg-brand-soft/60 hover:border-brand/50"
                    : "border-border bg-background hover:border-brand/30 hover:bg-brand-soft/40"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-muted-foreground">{filter.label}</span>
                  <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
                    {selectedValue ?? filter.placeholder}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-sm text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  ⌄
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {activeFilter && (
        <div
          id="homepage-quick-filter-options"
          className="mt-3 rounded-2xl border border-border bg-background p-3 shadow-sm sm:p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{activeFilter.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">בחרו אפשרות אחת לצורך ההמחשה</p>
            </div>
            {selectedValues[activeFilter.key] && (
              <button
                type="button"
                onClick={() => clearOption(activeFilter.key)}
                className="text-xs font-medium text-primary hover:underline"
              >
                ניקוי בחירה
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {activeFilter.options.map((option) => {
              const isSelected = selectedValues[activeFilter.key] === option;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectOption(activeFilter.key, option)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-brand bg-brand-soft text-primary"
                      : "border-border bg-surface-elevated text-foreground hover:border-brand/30 hover:bg-brand-soft/50"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
  const activeItem = items.find((item) => item.id === activeItemId);

  return (
    <section className={alternate ? "bg-brand-soft/35" : "bg-background"}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {items.map((item) => {
            const isActive = activeItemId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                aria-expanded={isActive}
                onClick={() => setActiveItemId(isActive ? null : item.id)}
                className={`group min-h-36 rounded-2xl border p-4 text-right shadow-card transition-all sm:min-h-40 sm:p-5 ${
                  isActive
                    ? "border-brand bg-brand-soft ring-2 ring-brand/10"
                    : "border-border bg-surface-elevated hover:-translate-y-0.5 hover:border-brand/35"
                }`}
              >
                <span className="flex h-full flex-col">
                  <span className="text-base font-bold text-foreground transition-colors group-hover:text-primary sm:text-lg">
                    {item.name}
                  </span>
                  <span className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground sm:text-sm">
                    {item.description}
                  </span>
                  <span className="mt-auto pt-4 text-xs font-semibold text-primary">
                    {isActive ? "סגירת הנושאים ↑" : "הצגת נושאים נפוצים ↓"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {activeItem && (
          <div className="mt-4 rounded-3xl border border-brand/20 bg-surface-elevated p-4 shadow-card sm:p-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div>
                <p className="text-xs font-semibold text-primary">נושאים נפוצים בתחום</p>
                <h3 className="mt-1 text-xl font-bold text-foreground">{activeItem.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground">לחיצה על נושא תוביל בהמשך לחיפוש ממוקד</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {activeItem.problems.map((problem) => (
                <button
                  key={problem}
                  type="button"
                  className="rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium text-foreground transition-all hover:border-brand/35 hover:bg-brand-soft hover:text-primary"
                >
                  {problem}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
