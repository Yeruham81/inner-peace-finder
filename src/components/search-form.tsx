import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

type QuickFilterKey = "regions" | "language" | "population" | "serviceType";

type FilterOption = {
  value: string;
  label: string;
};

type FilterDefinition = {
  key: QuickFilterKey;
  label: string;
  placeholder: string;
  options: FilterOption[];
  multiple?: boolean;
  helperText?: string;
};

const regionOptions: FilterOption[] = [
  { value: "north", label: "צפון" },
  { value: "haifa-krayot", label: "חיפה והקריות" },
  { value: "sharon", label: "השרון" },
  { value: "tel-aviv-gush-dan", label: "תל אביב וגוש דן" },
  { value: "center-shfela", label: "מרכז והשפלה" },
  { value: "jerusalem-area", label: "ירושלים והסביבה" },
  { value: "judea-samaria", label: "יהודה ושומרון" },
  { value: "south", label: "דרום" },
];

const languageOptions: FilterOption[] = [
  { value: "he", label: "עברית" },
  { value: "en", label: "אנגלית" },
  { value: "ar", label: "ערבית" },
  { value: "ru", label: "רוסית" },
  { value: "fr", label: "צרפתית" },
  { value: "es", label: "ספרדית" },
  { value: "de", label: "גרמנית" },
  { value: "am", label: "אמהרית" },
];

const populationOptions: FilterOption[] = [
  { value: "babies-toddlers", label: "תינוקות ופעוטות" },
  { value: "children", label: "ילדים" },
  { value: "adolescents", label: "בני נוער" },
  { value: "young-adults", label: "צעירים" },
  { value: "adults", label: "מבוגרים" },
  { value: "older-adults", label: "הגיל השלישי" },
  { value: "couples", label: "זוגות" },
  { value: "parents-families", label: "הורים ומשפחות" },
];

const serviceTypeOptions: FilterOption[] = [
  { value: "clinic", label: "פגישה בקליניקה" },
  { value: "online", label: "טיפול אונליין" },
  { value: "home-visit", label: "ביקור בית" },
  { value: "group", label: "טיפול קבוצתי" },
];

type SearchFormProps = {
  initialQuery?: string;

  // נשמר לצורך תאימות ל-index.tsx הקיים.
  // בחירת ערים מדויקת תתבצע בהמשך בעמוד התוצאות.
  cities?: string[];

  populations?: { slug: string; name: string }[];
  languages?: { code: string; name: string }[];
  initialFilters?: {
    region?: string | string[];
    regions?: string[];

    // תמיכה זמנית בפרמטר הישן, עד להוספת region לחוזה החיפוש.
    city?: string | string[];

    population?: string;
    language?: string;
    serviceType?: string | string[];
serviceTypes?: string[];
  };
  variant?: "hero" | "compact";
};

export function SearchForm({ initialQuery = "", initialFilters = {}, variant = "hero" }: SearchFormProps) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initialQuery);
  const [openFilter, setOpenFilter] = useState<QuickFilterKey | null>(null);

  const [selectedRegions, setSelectedRegions] = useState<string[]>(() => {
    if (initialFilters.regions?.length) return initialFilters.regions;

    if (Array.isArray(initialFilters.region)) return initialFilters.region;
    if (typeof initialFilters.region === "string" && initialFilters.region) {
      return initialFilters.region
        .split(",")
        .map((region) => region.trim())
        .filter(Boolean);
    }

    // תאימות לערכים שנשמרו בעבר תחת city.
    if (Array.isArray(initialFilters.city)) return initialFilters.city;
    if (typeof initialFilters.city === "string" && initialFilters.city) {
      return initialFilters.city
        .split(",")
        .map((region) => region.trim())
        .filter(Boolean);
    }

    return [];
  });

  const [population, setPopulation] = useState(initialFilters.population ?? "");
  const [language, setLanguage] = useState(initialFilters.language ?? "");
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<string[]>(() => {
  if (initialFilters.serviceTypes?.length) {
    return initialFilters.serviceTypes;
  }

  if (Array.isArray(initialFilters.serviceType)) {
    return initialFilters.serviceType;
  }

  if (typeof initialFilters.serviceType === "string" && initialFilters.serviceType) {
    return initialFilters.serviceType
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
});

  const isHero = variant === "hero";

  const filters = useMemo<FilterDefinition[]>(
    () => [
      {
        key: "regions",
        label: "אזור",
        placeholder: "כל הארץ",
        options: regionOptions,
        multiple: true,
        helperText: "בחרו אזור אחד או יותר. בעמוד התוצאות תוכלו למקד את החיפוש לפי ערים ויישובים.",
      },
      {
        key: "language",
        label: "שפת הטיפול",
        placeholder: "כל השפות",
        options: languageOptions,
        helperText: "בחרו את השפה שבה תרצו לקיים את הטיפול.",
      },
      {
        key: "population",
        label: "למי מיועד הטיפול",
        placeholder: "כל האוכלוסיות",
        options: populationOptions,
        helperText: "בחרו את האוכלוסייה שעבורה אתם מחפשים טיפול.",
      },
      {
        {
  key: "serviceType",
  label: "אופן הטיפול",
  placeholder: "כל האפשרויות",
  options: serviceTypeOptions,
  multiple: true,
  helperText: "בחרו אפשרות אחת או יותר לקבלת הטיפול.",
},
    ],
    [],
  );

  const activeFilter = filters.find((filter) => filter.key === openFilter);

  function submit(e: React.FormEvent) {
    e.preventDefault();

    navigate({
      to: "/search",
      search: {
        q: q.trim() || undefined,

        // זמני: משתמשים בפרמטר הקיים city כדי לא לשבור את חוזה החיפוש.
        // בהמשך מומלץ להוסיף region/regions לעמוד התוצאות ולמנוע החיפוש.
        city: selectedRegions.length ? selectedRegions.join(",") : undefined,

        population: population || undefined,
        language: language || undefined,
      },
    });
  }

  function getSelectedValues(key: QuickFilterKey): string[] {
    switch (key) {
      case "regions":
        return selectedRegions;
      case "language":
        return language ? [language] : [];
      case "population":
        return population ? [population] : [];
      case "serviceType":
  return selectedServiceTypes;
    }
  }

  function getFilterSummary(filter: FilterDefinition): string {
    const selected = getSelectedValues(filter.key);
    if (!selected.length) return filter.placeholder;

    const labels = selected
      .map((value) => filter.options.find((option) => option.value === value)?.label ?? value)
      .filter(Boolean);

    if (filter.multiple && labels.length > 2) {
      return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
    }

    return labels.join(", ");
  }

  function toggleOption(filter: FilterDefinition, value: string) {
    if (filter.key === "regions") {
      setSelectedRegions((current) =>
        current.includes(value) ? current.filter((region) => region !== value) : [...current, value],
      );
      return;
    }

    if (filter.key === "language") setLanguage(value);
    if (filter.key === "population") setPopulation(value);
    if (filter.key === "serviceType") {
  setSelectedServiceTypes((current) =>
    current.includes(value)
      ? current.filter((serviceType) => serviceType !== value)
      : [...current, value],
  );
  return;
}

setOpenFilter(null);
  }

  function clearFilter(key: QuickFilterKey) {
    if (key === "regions") setSelectedRegions([]);
    if (key === "language") setLanguage("");
    if (key === "population") setPopulation("");
    if (key === "serviceType") setSelectedServiceTypes([]);
  }

  return (
    <form
      onSubmit={submit}
      className={
        isHero
          ? "rounded-3xl border border-border bg-surface-elevated p-4 shadow-soft sm:p-6"
          : "rounded-2xl border border-border bg-surface-elevated p-3 shadow-card sm:p-4"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="לדוגמה: חרדה לפני עבודה, משבר בזוגיות, פסיכולוגית לנוער בי-ם, מטפל ב-CBT בחיפה וכד'"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/80 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          aria-label="חיפוש לפי בעיה, שירות או איש מקצוע"
        />

        <button
          type="submit"
          className="shrink-0 rounded-xl bg-brand px-6 py-3 text-base font-semibold text-brand-foreground shadow-soft transition-colors hover:bg-primary"
        >
          חיפוש מטפלים
        </button>
      </div>

      {isHero && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {filters.map((filter) => {
              const selectedValues = getSelectedValues(filter.key);
              const isOpen = openFilter === filter.key;

              return (
                <button
                  key={filter.key}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls="homepage-filter-options"
                  onClick={() => setOpenFilter(isOpen ? null : filter.key)}
                  className={`min-w-0 rounded-2xl border px-3 py-3 text-right transition-all sm:px-4 ${
                    isOpen
                      ? "border-brand bg-brand-soft shadow-sm"
                      : selectedValues.length
                        ? "border-brand/30 bg-brand-soft/60 hover:border-brand/50"
                        : "border-border bg-background hover:border-brand/30 hover:bg-brand-soft/40"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-muted-foreground">{filter.label}</span>
                      <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
                        {getFilterSummary(filter)}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-1.5">
                      {filter.multiple && selectedValues.length > 0 && (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-foreground">
                          {selectedValues.length}
                        </span>
                      )}

                      <span
                        aria-hidden="true"
                        className={`text-sm text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                      >
                        ⌄
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {activeFilter && (
            <div
              id="homepage-filter-options"
              className="mt-3 rounded-2xl border border-border bg-background p-3 shadow-sm sm:p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{activeFilter.label}</p>
                  {activeFilter.helperText && (
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{activeFilter.helperText}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {getSelectedValues(activeFilter.key).length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFilter(activeFilter.key)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      ניקוי בחירה
                    </button>
                  )}

                  {activeFilter.multiple && (
                    <button
                      type="button"
                      onClick={() => setOpenFilter(null)}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:bg-primary"
                    >
                      סיום
                    </button>
                  )}
                </div>
              </div>

              {activeFilter.options.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {activeFilter.options.map((option) => {
                    const isSelected = getSelectedValues(activeFilter.key).includes(option.value);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleOption(activeFilter, option.value)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          isSelected
                            ? "border-brand bg-brand-soft text-primary"
                            : "border-border bg-surface-elevated text-foreground hover:border-brand/30 hover:bg-brand-soft/50"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  האפשרויות יוצגו כאן לאחר טעינת נתוני הסינון.
                </p>
              )}
            </div>
          )}

          {selectedServiceTypes.length > 0 && (
  <p className="mt-3 text-xs leading-5 text-muted-foreground">
    אפשר לבחור כמה אופני טיפול. החיבור שלהם לתוצאות החיפוש יתווסף יחד עם מסך התוצאות.
  </p>
)}
        </div>
      )}
    </form>
  );
}
