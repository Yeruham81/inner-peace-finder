import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export function SearchForm({
  initialQuery = "",
  cities = [],
  populations = [],
  languages = [],
  initialFilters = {},
  variant = "hero",
}: {
  initialQuery?: string;
  cities?: string[];
  populations?: { slug: string; name: string }[];
  languages?: { code: string; name: string }[];
  initialFilters?: {
    city?: string;
    population?: string;
    language?: string;
  };
  variant?: "hero" | "compact";
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initialQuery);
  const [city, setCity] = useState(initialFilters.city ?? "");
  const [population, setPopulation] = useState(initialFilters.population ?? "");
  const [language, setLanguage] = useState(initialFilters.language ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    navigate({
      to: "/search",
      search: {
        q: q.trim() || undefined,
        city: city || undefined,
        population: population || undefined,
        language: language || undefined,
      },
    });
  }

  const isHero = variant === "hero";

  return (
    <form
      onSubmit={submit}
      className={
        isHero
          ? "rounded-3xl bg-surface-elevated p-4 shadow-soft sm:p-6"
          : "rounded-2xl bg-surface-elevated p-3 shadow-card"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder=" תארו במילים שלכם את הבעיה, למשל: לחץ לפני מבחן, פחד מטיסה, משבר בזוגיות וכד'"
          className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/80 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          aria-label="חיפוש לפי בעיה או תחושה"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand px-6 py-3 text-base font-semibold text-brand-foreground shadow-soft transition-colors hover:bg-primary"
        >
          חיפוש מטפלים
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select
          value={city}
          onChange={setCity}
          placeholder="כל הערים"
          options={cities.map((c) => ({ value: c, label: c }))}
        />
        <Select
          value={population}
          onChange={setPopulation}
          placeholder="כל האוכלוסיות"
          options={populations.map((p) => ({ value: p.slug, label: p.name }))}
        />
        <Select
          value={language}
          onChange={setLanguage}
          placeholder="כל השפות"
          options={languages.map((l) => ({ value: l.code, label: l.name }))}
        />
      </div>
    </form>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
