/**
 * Phase Q1 v4 — server-side catalog loader for the query interpreter.
 * Cached in-process with a TTL. Server-only; never import from client code.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { foldSofit, lightNormalizeHebrew } from "./hebrew-normalizer";
import { applyEligibility } from "./search-eligibility";
import type {
  Catalog,
  CityEntry,
  LanguageEntry,
  Modality,
  PopulationEntry,
  Profession,
  TherapistNameEntry,
} from "./query-interpreter.types";

const TTL_MS = 60_000;
let cache: { at: number; catalog: Catalog } | null = null;

export const CITY_ALIASES: Record<string, string[]> = {
  "תל אביב": ['ת"א', "תא", "תל-אביב", "tel aviv", "telaviv"],
  "תל אביב-יפו": ["תל אביב יפו", "יפו"],
  "ירושלים": ["jerusalem"],
  "חיפה": ["haifa"],
  "באר שבע": ['ב"ש', "beersheba", "beer sheva"],
  "פתח תקווה": ['פ"ת', "פתח תקוה"],
  "ראשון לציון": ['ראשל"צ'],
};

function serverClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

function normVariant(s: string | null | undefined): string {
  if (!s) return "";
  return foldSofit(lightNormalizeHebrew(s).toLowerCase()).trim();
}

function feminineFormsFor(name: string): string[] {
  const n = name.trim();
  if (!n) return [];
  const out = new Set<string>();
  if (/ג$/.test(n)) out.add(n + "ית");
  if (/[לץצרדןנ]$/.test(n)) out.add(n + "ת");
  if (/יועץ$/.test(n)) out.add(n.replace(/יועץ$/, "יועצת"));
  return Array.from(out);
}

export async function loadSearchCatalog(): Promise<Catalog> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.catalog;

  const sb = serverClient();

  const cityQ = applyEligibility(
    sb
      .from("therapist_locations")
      .select("city, therapists!inner(id, is_active, profile_status, visibility)")
      .eq("is_active", true),
    "therapists!inner",
  );
  const nameQ = applyEligibility(sb.from("therapists").select("id, full_name"));

  const [profRes, modRes, popRes, langRes, cityRes, nameRes] = await Promise.all([
    sb.from("professions").select("id, slug, name_he, name_en").eq("is_active", true),
    sb.from("treatment_modalities").select("id, slug, name_he, name_en").eq("is_active", true),
    sb.from("population_groups").select("id, slug, name"),
    sb.from("languages").select("id, code, name"),
    cityQ as unknown as Promise<{ data: Array<{ city: string | null }> | null; error: unknown }>,
    nameQ as unknown as Promise<{ data: Array<{ id: string; full_name: string }> | null; error: unknown }>,
  ]);
  // Fail loudly rather than silently returning an empty catalog.
  for (const r of [profRes, modRes, popRes, langRes, cityRes, nameRes]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = (r as any).error;
    if (err) throw err;
  }
  const profs = profRes.data;
  const mods = modRes.data;

  const professions: Profession[] = (profs ?? []).map((p) => {
    const feminine = feminineFormsFor(p.name_he);
    const variants = new Set<string>();
    for (const v of [p.name_he, p.name_en ?? "", p.slug, ...feminine]) {
      const nv = normVariant(v);
      if (nv) variants.add(nv);
    }
    return {
      id: p.id,
      slug: p.slug,
      name_he: p.name_he,
      nameVariants: Array.from(variants),
      feminineVariants: feminine.map(normVariant).filter(Boolean),
    };
  });

  const modalities: Modality[] = (mods ?? []).map((m) => {
    const variants = new Set<string>();
    for (const v of [m.name_he, m.name_en ?? "", m.slug]) {
      const nv = normVariant(v);
      if (nv) variants.add(nv);
    }
    return { id: m.id, slug: m.slug, name_he: m.name_he, nameVariants: Array.from(variants) };
  });

  const populations: PopulationEntry[] = (popRes.data ?? []).map(
    (p: { slug: string; name: string }) => ({
      slug: p.slug,
      name_he: p.name,
      aliases: [p.name, p.slug],
    }),
  );
  // Minimal Hebrew aliases for the most common language names — the DB
  // stores the English label, so we bootstrap the Hebrew surface forms
  // here rather than adding schema. Interpretation-only.
  const HE_LANG_ALIASES: Record<string, string[]> = {
    he: ["עברית", "עיברית"],
    en: ["אנגלית", "english"],
    ru: ["רוסית", "russian"],
    ar: ["ערבית", "arabic"],
    fr: ["צרפתית", "french"],
    es: ["ספרדית", "spanish"],
    am: ["אמהרית"],
  };
  const languages: LanguageEntry[] = (langRes.data ?? []).map(
    (l: { code: string; name: string }) => ({
      code: l.code,
      name_he: l.name,
      aliases: [l.name, l.code, ...(HE_LANG_ALIASES[l.code.toLowerCase()] ?? [])],
    }),
  );

  const cityMap = new Map<string, CityEntry>();
  for (const row of (cityRes.data ?? []) as Array<{ city: string | null }>) {
    if (!row.city) continue;
    const canonical = row.city.trim();
    if (!canonical || cityMap.has(canonical)) continue;
    const aliases = new Set<string>([normVariant(canonical)]);
    for (const a of CITY_ALIASES[canonical] ?? []) {
      const nv = normVariant(a);
      if (nv) aliases.add(nv);
    }
    cityMap.set(canonical, { canonical, aliases: Array.from(aliases) });
  }

  const therapistNames: TherapistNameEntry[] = [];
  const firstNameCount = new Map<string, number>();
  for (const t of (nameRes.data ?? []) as Array<{ id: string; full_name: string }>) {
    const tokens = normVariant(t.full_name).split(" ").filter(Boolean);
    if (tokens.length === 0) continue;
    therapistNames.push({ id: t.id, fullName: t.full_name, tokens });
    firstNameCount.set(tokens[0], (firstNameCount.get(tokens[0]) ?? 0) + 1);
  }

  const catalog: Catalog = {
    professions,
    modalities,
    populations,
    languages,
    cities: Array.from(cityMap.values()),
    therapistNames,
    firstNameCount,
  };
  cache = { at: now, catalog };
  return catalog;
}

export function __resetCatalogCache(): void {
  cache = null;
}