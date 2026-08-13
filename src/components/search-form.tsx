import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CANONICAL_LANGUAGES } from "@/lib/language-options";
import { REGION_DEFINITIONS, REGION_SLUGS } from "@/lib/locality-options";
import { resolveSearchContract, serializeMultiValue } from "@/lib/search-contract";

type FilterKey =
  | "regions"
  | "city"
  | "language"
  | "population"
  | "serviceType"
  | "profession"
  | "modality"
  | "therapyFormat"
  | "gender";

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
  professions?: { slug: string; name: string }[];
  modalities?: { slug: string; name: string }[];
  therapyFormats?: { slug: string; name: string }[];
  initialFilters?: {
    region?: string | string[];
    regions?: string[];
    city?: string | string[];
    population?: string;
    language?: string;
    serviceType?: string | string[];
    serviceTypes?: string[];
    professions?: string[];
    modalities?: string[];
    therapyFormats?: string[];
    gender?: string;
    accessible?: boolean;
    verified?: boolean;
    lgbtqAffirming?: boolean;
    freeIntro?: boolean;
  };
  preserveSearch?: {
    problem?: string;
    flow?: string;
  };
  variant?: "hero" | "compact" | "simple";
  availableQuickFilters?: string[];
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
  professions = [],
  modalities = [],
  therapyFormats = [],
  initialFilters = {},
  preserveSearch,
  variant = "hero",
  availableQuickFilters,
}: SearchFormProps) {
  const navigate = useNavigate();
  const isHero = variant === "hero";
  const isCompact = variant === "compact";

  const appliedContract = resolveSearchContract({
    q: initialQuery,
    city: Array.isArray(initialFilters.city) ? initialFilters.city[0] : initialFilters.city,
    population: initialFilters.population,
    language: initialFilters.language,
    regions: multiValue(initialFilters.regions, initialFilters.region),
    serviceTypes: multiValue(initialFilters.serviceTypes, initialFilters.serviceType),
    professions: initialFilters.professions,
    modalities: initialFilters.modalities,
    therapyFormats: initialFilters.therapyFormats,
    gender: initialFilters.gender,
    accessible: initialFilters.accessible,
    verified: initialFilters.verified,
    lgbtqAffirming: initialFilters.lgbtqAffirming,
    freeIntro: initialFilters.freeIntro,
  });
  const appliedRegionKey = appliedContract.regions.join(",");
  const appliedServiceTypeKey = appliedContract.serviceTypes.join(",");
  const appliedProfessionKey = appliedContract.professionSlugs.join(",");
  const appliedModalityKey = appliedContract.modalitySlugs.join(",");
  const appliedTherapyFormatKey = appliedContract.therapyFormats.join(",");

  const [q, setQ] = useState(appliedContract.q);
  const [city, setCity] = useState(appliedContract.city);
  const [population, setPopulation] = useState(appliedContract.population);
  const [language, setLanguage] = useState(appliedContract.language);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([...appliedContract.regions]);
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<string[]>([...appliedContract.serviceTypes]);
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>([...appliedContract.professionSlugs]);
  const [selectedModalities, setSelectedModalities] = useState<string[]>([...appliedContract.modalitySlugs]);
  const [selectedTherapyFormats, setSelectedTherapyFormats] = useState<string[]>([...appliedContract.therapyFormats]);
  const [gender, setGender] = useState(appliedContract.gender);
  const [accessible, setAccessible] = useState(appliedContract.accessible);
  const [verified, setVerified] = useState(appliedContract.verified);
  const [lgbtqAffirming, setLgbtqAffirming] = useState(appliedContract.lgbtqAffirming);
  const [freeIntro, setFreeIntro] = useState(appliedContract.freeIntro);
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
    setSelectedProfessions([...appliedContract.professionSlugs]);
    setSelectedModalities([...appliedContract.modalitySlugs]);
    setSelectedTherapyFormats([...appliedContract.therapyFormats]);
    setGender(appliedContract.gender);
    setAccessible(appliedContract.accessible);
    setVerified(appliedContract.verified);
    setLgbtqAffirming(appliedContract.lgbtqAffirming);
    setFreeIntro(appliedContract.freeIntro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appliedContract.q,
    appliedContract.city,
    appliedContract.population,
    appliedContract.language,
    appliedRegionKey,
    appliedServiceTypeKey,
    appliedProfessionKey,
    appliedModalityKey,
    appliedTherapyFormatKey,
    appliedContract.gender,
    appliedContract.accessible,
    appliedContract.verified,
    appliedContract.lgbtqAffirming,
    appliedContract.freeIntro,
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
      {
        key: "profession",
        label: "מקצוע",
        placeholder: "כל המקצועות",
        options: professions.map((item) => ({ value: item.slug, label: item.name })),
        multiple: true,
      },
      {
        key: "modality",
        label: "שיטת טיפול",
        placeholder: "כל השיטות",
        options: modalities.map((item) => ({ value: item.slug, label: item.name })),
        multiple: true,
      },
      {
        key: "therapyFormat",
        label: "מסגרת טיפול",
        placeholder: "כל המסגרות",
        options: therapyFormats.map((item) => ({ value: item.slug, label: item.name })),
        multiple: true,
      },
      {
        key: "gender",
        label: "מגדר המטפל/ת",
        placeholder: "ללא העדפה",
        options: [
          { value: "female", label: "אישה" },
          { value: "male", label: "גבר" },
        ],
      },
    ],
    [cityOptions, languageOptions, populationOptions, professions, modalities, therapyFormats],
  );

  const visibleFilters = isHero
    ? filters.filter((filter) => ["regions", "language", "population", "serviceType"].includes(filter.key))
    : filters;
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
      case "profession":
        return selectedProfessions;
      case "modality":
        return selectedModalities;
      case "therapyFormat":
        return selectedTherapyFormats;
      case "gender":
        return gender ? [gender] : [];
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
    ...appliedContract.professionSlugs.map((value) => ({
      key: "profession" as const,
      value,
      label: optionLabel("profession", value),
    })),
    ...appliedContract.modalitySlugs.map((value) => ({
      key: "modality" as const,
      value,
      label: optionLabel("modality", value),
    })),
    ...appliedContract.therapyFormats.map((value) => ({
      key: "therapyFormat" as const,
      value,
      label: optionLabel("therapyFormat", value),
    })),
    ...(appliedContract.gender
      ? [
          {
            key: "gender" as const,
            value: appliedContract.gender,
            label: optionLabel("gender", appliedContract.gender),
          },
        ]
      : []),
  ];
  const activeFilterCount =
    appliedChips.length +
    Number(appliedContract.accessible) +
    Number(appliedContract.verified) +
    Number(appliedContract.lgbtqAffirming) +
    Number(appliedContract.freeIntro);

  const quickFilters = [
    {
      key: "clinic",
      label: "פגישה בקליניקה",
      active: appliedContract.serviceTypes.includes("clinic"),
    },
    { key: "online", label: "אונליין", active: appliedContract.serviceTypes.includes("online") },
    {
      key: "home_visit",
      label: "ביקורי בית",
      active: appliedContract.serviceTypes.includes("home_visit"),
    },
    { key: "female", label: "אישה", active: appliedContract.gender === "female" },
    { key: "male", label: "גבר", active: appliedContract.gender === "male" },
    { key: "accessible", label: "קליניקה נגישה", active: appliedContract.accessible },
    { key: "verified", label: "הסמכה מאומתת", active: appliedContract.verified },
    { key: "lgbtqAffirming", label: "מותאם לקהילה הגאה", active: appliedContract.lgbtqAffirming },
    { key: "freeIntro", label: "היכרות ללא תשלום", active: appliedContract.freeIntro },
  ].filter((item) => item.active || !availableQuickFilters || availableQuickFilters.includes(item.key));

  function navigateToContract(input: {
    q: string;
    city?: string;
    population?: string;
    language?: string;
    regions?: readonly string[];
    serviceTypes?: readonly string[];
    professions?: readonly string[];
    modalities?: readonly string[];
    therapyFormats?: readonly string[];
    gender?: string;
    accessible?: boolean;
    verified?: boolean;
    lgbtqAffirming?: boolean;
    freeIntro?: boolean;
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
        professions: serializeMultiValue(contract.professionSlugs),
        modalities: serializeMultiValue(contract.modalitySlugs),
        therapyFormats: serializeMultiValue(contract.therapyFormats),
        gender: contract.gender || undefined,
        accessible: contract.accessible ? "1" : undefined,
        verified: contract.verified ? "1" : undefined,
        lgbtqAffirming: contract.lgbtqAffirming ? "1" : undefined,
        freeIntro: contract.freeIntro ? "1" : undefined,
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
      professions: selectedProfessions,
      modalities: selectedModalities,
      therapyFormats: selectedTherapyFormats,
      gender,
      accessible,
      verified,
      lgbtqAffirming,
      freeIntro,
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
    if (filter.key === "profession")
      setSelectedProfessions((current) =>
        current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
      );
    if (filter.key === "modality")
      setSelectedModalities((current) =>
        current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
      );
    if (filter.key === "therapyFormat")
      setSelectedTherapyFormats((current) =>
        current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
      );
    if (filter.key === "gender") setGender((current) => (current === value ? "" : (value as "male" | "female")));
  }

  function clearDraftFilter(key: FilterKey) {
    if (key === "regions") setSelectedRegions([]);
    if (key === "city") setCity("");
    if (key === "language") setLanguage("");
    if (key === "population") setPopulation("");
    if (key === "serviceType") setSelectedServiceTypes([]);
    if (key === "profession") setSelectedProfessions([]);
    if (key === "modality") setSelectedModalities([]);
    if (key === "therapyFormat") setSelectedTherapyFormats([]);
    if (key === "gender") setGender("");
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
      professions:
        chip.key === "profession"
          ? appliedContract.professionSlugs.filter((value) => value !== chip.value)
          : appliedContract.professionSlugs,
      modalities:
        chip.key === "modality"
          ? appliedContract.modalitySlugs.filter((value) => value !== chip.value)
          : appliedContract.modalitySlugs,
      therapyFormats:
        chip.key === "therapyFormat"
          ? appliedContract.therapyFormats.filter((value) => value !== chip.value)
          : appliedContract.therapyFormats,
      gender: chip.key === "gender" ? "" : appliedContract.gender,
      accessible: appliedContract.accessible,
      verified: appliedContract.verified,
      lgbtqAffirming: appliedContract.lgbtqAffirming,
      freeIntro: appliedContract.freeIntro,
    });
  }

  function clearAppliedFilters() {
    navigateToContract({ q: appliedContract.q });
  }

  function toggleQuickFilter(
    key:
      | "clinic"
      | "online"
      | "home_visit"
      | "female"
      | "male"
      | "accessible"
      | "verified"
      | "lgbtqAffirming"
      | "freeIntro",
  ) {
    const serviceTypes =
      key === "clinic" || key === "online" || key === "home_visit"
        ? appliedContract.serviceTypes.includes(key)
          ? appliedContract.serviceTypes.filter((value) => value !== key)
          : [...appliedContract.serviceTypes, key]
        : appliedContract.serviceTypes;
    const gender =
      key === "female" || key === "male" ? (appliedContract.gender === key ? "" : key) : appliedContract.gender;
    navigateToContract({
      ...appliedContract,
      professions: appliedContract.professionSlugs,
      modalities: appliedContract.modalitySlugs,
      serviceTypes,
      gender,
      accessible: key === "accessible" ? !appliedContract.accessible : appliedContract.accessible,
      verified: key === "verified" ? !appliedContract.verified : appliedContract.verified,
      lgbtqAffirming: key === "lgbtqAffirming" ? !appliedContract.lgbtqAffirming : appliedContract.lgbtqAffirming,
      freeIntro: key === "freeIntro" ? !appliedContract.freeIntro : appliedContract.freeIntro,
    });
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

      {isCompact && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="lg:hidden">
            <button
              type="button"
              aria-expanded={mobileFiltersOpen}
              aria-controls="search-filter-controls"
              onClick={() => setMobileFiltersOpen((open) => !open)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground"
            >
              <span>מסננים נוספים</span>
              {activeFilterCount > 0 && (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold text-brand-foreground">
                  {activeFilterCount}
                </span>
              )}
              <span aria-hidden="true">{mobileFiltersOpen ? "⌃" : "⌄"}</span>
            </button>
          </div>

          <div id="search-filter-controls" className={`${mobileFiltersOpen ? "block" : "hidden"} lg:block`}>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-9">
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

          {quickFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="מסננים זמינים בתוצאות הנוכחיות">
              {quickFilters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={item.active}
                  onClick={() => toggleQuickFilter(item.key as Parameters<typeof toggleQuickFilter>[0])}
                  className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${item.active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background text-foreground hover:border-brand/50"}`}
                >
                  {item.active && <span aria-hidden="true">✓ </span>}
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {appliedChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
