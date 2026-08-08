import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CANONICAL_LANGUAGES } from "@/lib/language-options";
import { REGION_DEFINITIONS, REGION_SLUGS } from "@/lib/locality-options";
import { resolveSearchContract, serializeMultiValue } from "@/lib/search-contract";

type FilterKey = "regions" | "city" | "language" | "population" | "serviceType";

type FilterOption = {
  value: string;
  label: string;
};

type FilterDefinition = {
  key: FilterKey;
  label: string;
  placeholder: string;
  options: FilterOption[];
  multiple?: boolean;
  helperText?: string;
};

type AppliedChip = {
  key: FilterKey;
  value: string;
  label: string;
};

const regionOptions: FilterOption[] = REGION_SLUGS.map((slug) => ({
  value: slug,
  label: REGION_DEFINITIONS[slug].label,
}));

const fallbackLanguageOptions: FilterOption[] = CANONICAL_LANGUAGES.map(({ code, name }) => ({
  value: code,
  label: name,
}));

const fallbackPopulationOptions: FilterOption[] = [
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
  { value: "home_visit", label: "ביקורי בית" },
];

type SearchFormProps = {
  initialQuery?: string;
  cities?: string[];
  populations?: { slug: string; name: string }[];
  languages?: { code: string; name: string }[];
  initialFilters?: {
    region?: string | string[];
    regions?: string[];
    city?: string | string[];
    population?: string;
    language?: string;
    serviceType?: string | string[];
    serviceTypes?: string[];
  };
  preserveSearch?: {
    problem?: string;
    flow?: string;
  };
  variant?: "hero" | "compact";
};

function multiValue(
  canonical: string[] | undefined,
  legacy: string | string[] | undefined,
): string | string[] | undefined {
  if (canonical?.length) return canonical;
  return legacy;
}

export function SearchForm({
  initialQuery = "",
  cities = [],
  populations = [],
  languages = [],
  initialFilters = {},
  preserveSearch,
  variant = "hero",
}: SearchFormProps) {
  const navigate = useNavigate();
  const isHero = variant === "hero";

  const appliedContract = resolveSearchContract({
    q: initialQuery,
    city: Array.isArray(initialFilters.city) ? initialFilters.city[0] : initialFilters.city,
    population: initialFilters.population,
    language: initialFilters.language,
    regions: multiValue(initialFilters.regions, initialFilters.region),
    serviceTypes: multiValue(initialFilters.serviceTypes, initialFilters.serviceType),
  });
  const appliedRegionKey = appliedContract.regions.join(",");
  const appliedServiceTypeKey = appliedContract.serviceTypes.join(",");

  const [q, setQ] = useState(appliedContract.q);
  const [city, setCity] = useState(appliedContract.city);
  const [population, setPopulation] = useState(appliedContract.population);
  const [language, setLanguage] = useState(appliedContract.language);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([...appliedContract.regions]);
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<string[]>([...appliedContract.serviceTypes]);
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Route search params can change without remounting this component (for
  // example, when removing a chip), so draft controls must follow the URL.
  useEffect(() => {
    setQ(appliedContract.q);
    setCity(appliedContract.city);
    setPopulation(appliedContract.population);
    setLanguage(appliedContract.language);
    setSelectedRegions(appliedRegionKey ? appliedRegionKey.split(",") : []);
    setSelectedServiceTypes(appliedServiceTypeKey ? appliedServiceTypeKey.split(",") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appliedContract.q,
    appliedContract.city,
    appliedContract.population,
    appliedContract.language,
    appliedRegionKey,
    appliedServiceTypeKey,
  ]);

  const cityOptions = useMemo<FilterOption[]>(() => {
    const unique = new Set(cities.map((value) => value.trim()).filter(Boolean));
    return [...unique].sort((a, b) => a.localeCompare(b, "he")).map((value) => ({ value, label: value }));
  }, [cities]);

  const languageOptions = useMemo<FilterOption[]>(
    () =>
      languages.length ? languages.map(({ code, name }) => ({ value: code, label: name })) : fallbackLanguageOptions,
    [languages],
  );

  const populationOptions = useMemo<FilterOption[]>(
    () =>
      populations.length
        ? populations.map(({ slug, name }) => ({ value: slug, label: name }))
        : fallbackPopulationOptions,
    [populations],
  );

  const filters = useMemo<FilterDefinition[]>(
    () => [
      {
        key: "regions",
        label: "אזור",
        placeholder: "כל הארץ",
        options: regionOptions,
        multiple: true,
        helperText: "אפשר לבחור אזור אחד או יותר.",
      },
      {
        key: "city",
        label: "יישוב",
        placeholder: "כל היישובים",
        options: cityOptions,
        helperText: "הבחירה מציגה מטפלים עם מיקום פעיל ביישוב המדויק.",
      },
      {
        key: "language",
        label: "שפת טיפול",
        placeholder: "כל השפות",
        options: languageOptions,
      },
      {
        key: "population",
        label: "אוכלוסיית יעד",
        placeholder: "כל האוכלוסיות",
        options: populationOptions,
      },
      {
        key: "serviceType",
        label: "אופן הטיפול",
        placeholder: "כל האפשרויות",
        options: serviceTypeOptions,
        multiple: true,
        helperText: "אזור חל על קליניקה או ביקורי בית; טיפול אונליין אינו תלוי באזור.",
      },
    ],
    [cityOptions, languageOptions, populationOptions],
  );

  const visibleFilters = isHero ? filters.filter((filter) => filter.key !== "city") : filters;
  const activeFilter = visibleFilters.find((filter) => filter.key === openFilter);

  function selectedValues(key: FilterKey): string[] {
    switch (key) {
      case "regions":
        return selectedRegions;
      case "city":
        return city ? [city] : [];
      case "language":
        return language ? [language] : [];
      case "population":
        return population ? [population] : [];
      case "serviceType":
        return selectedServiceTypes;
    }
  }

  function optionLabel(key: FilterKey, value: string): string {
    const definition = filters.find((filter) => filter.key === key);
    return definition?.options.find((option) => option.value === value)?.label ?? value;
  }

  function filterSummary(filter: FilterDefinition): string {
    const selected = selectedValues(filter.key);
    if (!selected.length) return filter.placeholder;
    const labels = selected.map((value) => optionLabel(filter.key, value));
    return filter.multiple && labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0];
  }

  const appliedChips: AppliedChip[] = [
    ...appliedContract.regions.map((value) => ({
      key: "regions" as const,
      value,
      label: optionLabel("regions", value),
    })),
    ...(appliedContract.city
      ? [
          {
            key: "city" as const,
            value: appliedContract.city,
            label: appliedContract.city,
          },
        ]
      : []),
    ...(appliedContract.language
      ? [
          {
            key: "language" as const,
            value: appliedContract.language,
            label: optionLabel("language", appliedContract.language),
          },
        ]
      : []),
    ...(appliedContract.population
      ? [
          {
            key: "population" as const,
            value: appliedContract.population,
            label: optionLabel("population", appliedContract.population),
          },
        ]
      : []),
    ...appliedContract.serviceTypes.map((value) => ({
      key: "serviceType" as const,
      value,
      label: optionLabel("serviceType", value),
    })),
  ];

  function navigateToContract(input: {
    q: string;
    city?: string;
    population?: string;
    language?: string;
    regions?: readonly string[];
    serviceTypes?: readonly string[];
  }) {
    const contract = resolveSearchContract(input);
    navigate({
      to: "/search",
      search: {
        q: contract.q || undefined,
        problem: preserveSearch?.problem || undefined,
        city: contract.city || undefined,
        population: contract.population || undefined,
        language: contract.language || undefined,
        regions: serializeMultiValue(contract.regions),
        serviceTypes: serializeMultiValue(contract.serviceTypes),
        flow: preserveSearch?.flow || undefined,
      },
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    navigateToContract({
      q,
      city,
      population,
      language,
      regions: selectedRegions,
      serviceTypes: selectedServiceTypes,
    });
    setOpenFilter(null);
    setMobileFiltersOpen(false);
  }

  function toggleOption(filter: FilterDefinition, value: string) {
    if (filter.key === "regions") {
      setSelectedRegions((current) =>
        current.includes(value) ? current.filter((region) => region !== value) : [...current, value],
      );
      return;
    }
    if (filter.key === "serviceType") {
      setSelectedServiceTypes((current) =>
        current.includes(value) ? current.filter((serviceType) => serviceType !== value) : [...current, value],
      );
      return;
    }
    if (filter.key === "city") setCity((current) => (current === value ? "" : value));
    if (filter.key === "language") {
      setLanguage((current) => (current === value ? "" : value));
    }
    if (filter.key === "population") {
      setPopulation((current) => (current === value ? "" : value));
    }
  }

  function clearDraftFilter(key: FilterKey) {
    if (key === "regions") setSelectedRegions([]);
    if (key === "city") setCity("");
    if (key === "language") setLanguage("");
    if (key === "population") setPopulation("");
    if (key === "serviceType") setSelectedServiceTypes([]);
  }

  function removeAppliedChip(chip: AppliedChip) {
    navigateToContract({
      q: appliedContract.q,
      city: chip.key === "city" ? "" : appliedContract.city,
      population: chip.key === "population" ? "" : appliedContract.population,
      language: chip.key === "language" ? "" : appliedContract.language,
      regions:
        chip.key === "regions"
          ? appliedContract.regions.filter((value) => value !== chip.value)
          : appliedContract.regions,
      serviceTypes:
        chip.key === "serviceType"
          ? appliedContract.serviceTypes.filter((value) => value !== chip.value)
          : appliedContract.serviceTypes,
    });
  }

  function clearAppliedFilters() {
    navigateToContract({ q: appliedContract.q });
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
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            isHero ? "לדוגמה: חרדה לפני עבודה, משבר בזוגיות או מטפל ב-CBT בחיפה" : "מה תרצו למצוא? למשל: טיפול בחרדה"
          }
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/80 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          aria-label="חיפוש לפי בעיה, שירות או איש מקצוע"
        />

        <button
          type="submit"
          className="shrink-0 rounded-xl bg-brand px-6 py-3 text-base font-semibold text-brand-foreground shadow-soft transition-colors hover:bg-primary focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2"
        >
          חיפוש מטפלים
        </button>
      </div>

      {!isHero && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3 sm:hidden">
            <button
              type="button"
              aria-expanded={mobileFiltersOpen}
              aria-controls="search-filter-controls"
              onClick={() => setMobileFiltersOpen((open) => !open)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground"
            >
              <span>סינון</span>
              {appliedChips.length > 0 && (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold text-brand-foreground">
                  {appliedChips.length}
                </span>
              )}
              <span aria-hidden="true">{mobileFiltersOpen ? "⌃" : "⌄"}</span>
            </button>
          </div>

          {appliedChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0 sm:mb-3">
              <span className="text-xs font-medium text-muted-foreground">סינון פעיל:</span>
              {appliedChips.map((chip) => (
                <button
                  key={`${chip.key}-${chip.value}`}
                  type="button"
                  onClick={() => removeAppliedChip(chip)}
                  aria-label={`הסרת הסינון ${chip.label}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft px-3 py-1 text-xs font-medium text-primary transition-colors hover:border-brand/50 hover:bg-brand-soft/80"
                >
                  <span>{chip.label}</span>
                  <span aria-hidden="true" className="text-base leading-none">
                    ×
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={clearAppliedFilters}
                className="min-h-8 px-1 text-xs font-medium text-primary hover:underline"
              >
                ניקוי כל המסננים
              </button>
            </div>
          )}

          <div id="search-filter-controls" className={`${mobileFiltersOpen ? "block" : "hidden"} sm:block`}>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:mt-0 sm:grid-cols-2 lg:grid-cols-5">
              {visibleFilters.map((filter) => {
                const values = selectedValues(filter.key);
                const isOpen = openFilter === filter.key;
                return (
                  <FilterButton
                    key={filter.key}
                    filter={filter}
                    summary={filterSummary(filter)}
                    count={filter.multiple ? values.length : 0}
                    isOpen={isOpen}
                    onClick={() => setOpenFilter(isOpen ? null : filter.key)}
                  />
                );
              })}
            </div>

            {activeFilter && (
              <FilterOptions
                filter={activeFilter}
                selected={selectedValues(activeFilter.key)}
                onToggle={(value) => toggleOption(activeFilter, value)}
                onClear={() => clearDraftFilter(activeFilter.key)}
                onClose={() => setOpenFilter(null)}
              />
            )}
          </div>
        </div>
      )}

      {isHero && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {visibleFilters.map((filter) => {
              const values = selectedValues(filter.key);
              const isOpen = openFilter === filter.key;
              return (
                <FilterButton
                  key={filter.key}
                  filter={filter}
                  summary={filterSummary(filter)}
                  count={filter.multiple ? values.length : 0}
                  isOpen={isOpen}
                  onClick={() => setOpenFilter(isOpen ? null : filter.key)}
                />
              );
            })}
          </div>

          {activeFilter && (
            <FilterOptions
              filter={activeFilter}
              selected={selectedValues(activeFilter.key)}
              onToggle={(value) => toggleOption(activeFilter, value)}
              onClear={() => clearDraftFilter(activeFilter.key)}
              onClose={() => setOpenFilter(null)}
            />
          )}
        </div>
      )}
    </form>
  );
}

function FilterButton({
  filter,
  summary,
  count,
  isOpen,
  onClick,
}: {
  filter: FilterDefinition;
  summary: string;
  count: number;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls="search-filter-options"
      onClick={onClick}
      className={`min-w-0 rounded-xl border px-3 py-2.5 text-right transition-colors sm:px-4 ${
        isOpen
          ? "border-brand bg-brand-soft shadow-sm"
          : count > 0 || summary !== filter.placeholder
            ? "border-brand/30 bg-brand-soft/60 hover:border-brand/50"
            : "border-border bg-background hover:border-brand/30 hover:bg-brand-soft/40"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
            {filter.label}
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{summary}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {count > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-foreground">
              {count}
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
}

function FilterOptions({
  filter,
  selected,
  onToggle,
  onClear,
  onClose,
}: {
  filter: FilterDefinition;
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div
      id="search-filter-options"
      className="mt-3 rounded-2xl border border-brand/25 bg-brand-soft/35 p-3 shadow-card sm:p-4"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{filter.label}</p>
          {filter.helperText && (
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{filter.helperText}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`סגירת אפשרויות ${filter.label}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-muted-foreground hover:bg-background hover:text-foreground"
        >
          ×
        </button>
      </div>

      {filter.options.length > 0 ? (
        <div className="max-h-64 overflow-y-auto pe-1">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {filter.options.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onToggle(option.value)}
                  className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
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
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          אין כרגע אפשרויות זמינות לסינון הזה.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
        {selected.length > 0 ? (
          <button type="button" onClick={onClear} className="text-xs font-medium text-primary hover:underline">
            ניקוי בחירה
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-primary"
        >
          הצגת תוצאות
        </button>
      </div>
    </div>
  );
}
