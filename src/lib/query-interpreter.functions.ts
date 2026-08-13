/**
 * Phase Q1 — server-function orchestration for the unified search flow.
 *
 * This file is thin I/O + orchestration. It:
 *   1. Loads/interprets the query,
 *   2. Classifies the semantic remainder,
 *   3. Builds a `SupabaseTherapistRepo`,
 *   4. Delegates to the pure `executeUnifiedSearch` executor.
 *
 * All deterministic search logic lives in `unified-search-executor.ts` and
 * `unified-search.ts`. The future LLM interpreter will replace only the
 * interpretation step and produce the same `TherapistSearchPlan` shape.
 */

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { SemanticEngine } from "./semantic-engine";
import { parseStoredProfile } from "./therapist-semantic-profile";
import { loadSearchCatalog } from "./query-catalog";
import { interpretQuery } from "./query-interpreter";
import { applyExplicitFilters, validateExplicitFilters, type RawExplicitFilters } from "./explicit-filters";
import { applyEligibility } from "./search-eligibility";
import {
  executeUnifiedSearch,
  type DisplayRow,
  type HydratedCandidate,
  type TherapistRepo,
} from "./unified-search-executor";
import { matchesLocationAvailability } from "./unified-search-executor";
import { regionSlugForStoredValue, resolveStoredRegion } from "./locality-options";
import { PHYSICAL_SERVICE_TYPES } from "./search-contract";
import { hasExplicitFilters } from "./explicit-filters";
import { buildCardLocationDisplay, type ActiveLocationRow, type SearchResultCard } from "./search-result-card";
import type {
  InterpretationResult,
  SemanticSignal,
  TherapistGender,
  TherapistSearchPlan,
} from "./query-interpreter.types";

const Input = z.object({
  query: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  population: z.string().trim().max(40).optional().default(""),
  language: z.string().trim().max(8).optional().default(""),
  regions: z.union([z.string().max(200), z.array(z.string().max(40))]).optional(),
  serviceTypes: z.union([z.string().max(120), z.array(z.string().max(40))]).optional(),
  professions: z.union([z.string().max(300), z.array(z.string().max(80))]).optional(),
  modalities: z.union([z.string().max(500), z.array(z.string().max(80))]).optional(),
  therapyFormats: z.union([z.string().max(200), z.array(z.string().max(40))]).optional(),
  gender: z.enum(["male", "female"]).optional(),
  accessible: z.boolean().optional(),
  verified: z.boolean().optional(),
  lgbtqAffirming: z.boolean().optional(),
  freeIntro: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const InterpretInput = z.object({
  query: z.string().trim().min(1).max(200),
});

async function serverClient(): Promise<SupabaseClient<Database>> {
  // Server-only trusted read client; `anon` cannot read public.therapists.
  const { trustedReadClient } = await import("./trusted-read-client.server");
  return trustedReadClient();
}

export type UnifiedSearchResult = {
  plan: TherapistSearchPlan;
  results: SearchResultCard[];
  emptyReason: null | "unrecognized_query" | "no_matching_therapists";
  /** Diagnostics: cards that needed the primary-clinic display fallback. */
  primaryClinicFallbackCount: number;
};

/**
 * Throw on Supabase read failure so the executor never mistakes a failed
 * query for an empty result. Callers pass the tuple returned by supabase-js.
 */
function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data ?? ([] as unknown as T);
}

async function buildPlan(
  query: string,
  explicitRaw: RawExplicitFilters,
  sb: SupabaseClient<Database>,
): Promise<{ plan: TherapistSearchPlan; interpretation: InterpretationResult }> {
  const catalog = await loadSearchCatalog(sb);
  const interpretation = interpretQuery(query, catalog);
  let semanticSignals: SemanticSignal[] = [];
  if (interpretation.semanticRemainder.length > 0 && !interpretation.unresolvedPrimary) {
    const classified = await SemanticEngine.classify(interpretation.semanticRemainder, sb);
    semanticSignals = classified.map((c) => ({ slug: c.slug, confidence: c.confidence }));
  }

  // Explicit UI filters are canonicalized and folded in as HARD filters.
  // They are authoritative over anything the query inferred.
  const explicit = validateExplicitFilters(explicitRaw, catalog);
  const merged = applyExplicitFilters(interpretation.hardFilters, interpretation.softPreferences, explicit);

  const plan: TherapistSearchPlan = {
    interpretation,
    semanticSignals,
    hardFilters: merged.hardFilters,
    softPreferences: merged.softPreferences,
    therapistNameIds: interpretation.therapistNameIds,
    emptyReason: interpretation.unresolvedPrimary ? "unrecognized_query" : null,
    browseAll: query.trim().length === 0 && !hasExplicitFilters(explicitRaw),
    explicitFilters: explicit,
    filterConflicts: merged.conflicts,
  };
  return { plan, interpretation };
}

/* ------------------------------------------------------------------ */
/* Supabase adapter for TherapistRepo                                  */
/* ------------------------------------------------------------------ */

function collect(rows: Array<{ therapist_id: string }> | null): Set<string> {
  const out = new Set<string>();
  for (const r of rows ?? []) out.add(r.therapist_id);
  return out;
}

function createSupabaseRepo(sb: SupabaseClient<Database>): TherapistRepo {
  const filterByEligible = (ids: Set<string>, eligible: Set<string>): Set<string> => {
    const out = new Set<string>();
    for (const id of ids) if (eligible.has(id)) out.add(id);
    return out;
  };

  // Cache the eligibility set inside the repo instance so multiple lookups
  // during one request never re-query it (spec §7).
  let cachedEligible: Set<string> | null = null;
  const eligibleIds = async (): Promise<Set<string>> => {
    if (cachedEligible) return cachedEligible;
    const rows = unwrap(
      (await applyEligibility(sb.from("therapists").select("id"))) as unknown as {
        data: Array<{ id: string }> | null;
        error: unknown;
      },
    );
    cachedEligible = new Set(rows.map((r) => r.id));
    return cachedEligible;
  };

  return {
    async loadEligibleIds() {
      return eligibleIds();
    },
    async idsByProfessions(slugs) {
      if (slugs.length === 0) return new Set();
      const rows = unwrap(
        (await sb
          .from("therapist_professions")
          .select("therapist_id, professions!inner(slug)")
          .in("professions.slug", slugs)) as unknown as {
          data: Array<{ therapist_id: string }> | null;
          error: unknown;
        },
      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByModalities(slugs) {
      if (slugs.length === 0) return new Set();
      const rows = unwrap(
        (await sb
          .from("therapist_modalities")
          .select("therapist_id, treatment_modalities!inner(slug)")
          .in("treatment_modalities.slug", slugs)) as unknown as {
          data: Array<{ therapist_id: string }> | null;
          error: unknown;
        },
      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByPopulations(slugs) {
      if (slugs.length === 0) return new Set();
      const rows = unwrap(
        (await sb
          .from("therapist_populations")
          .select("therapist_id, population_groups!inner(slug)")
          .in("population_groups.slug", slugs)) as unknown as {
          data: Array<{ therapist_id: string }> | null;
          error: unknown;
        },
      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByLanguages(codes) {
      if (codes.length === 0) return new Set();
      const rows = unwrap(
        (await sb
          .from("therapist_languages")
          .select("therapist_id, languages!inner(code)")
          .in("languages.code", codes)) as unknown as {
          data: Array<{ therapist_id: string }> | null;
          error: unknown;
        },
      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByCities(cities) {
      if (cities.length === 0) return new Set();
      const rows = unwrap(
        (await sb
          .from("therapist_locations")
          .select("therapist_id")
          .eq("is_active", true)
          .in("city", cities)) as unknown as {
          data: Array<{ therapist_id: string }> | null;
          error: unknown;
        },
      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByLocationAvailability(filter) {
      const { regionSlugs, serviceTypes } = filter;
      if (regionSlugs.length === 0 && serviceTypes.length === 0) return new Set();

      // One query for every location type that could satisfy the filter, then
      // correlate region + type on the SAME row in memory.
      const typesToLoad = serviceTypes.length > 0 ? serviceTypes : [...PHYSICAL_SERVICE_TYPES];
      const rows = unwrap(
        (await sb
          .from("therapist_locations")
          .select("therapist_id, location_type, region")
          .eq("is_active", true)
          .in("location_type", typesToLoad as Array<Database["public"]["Enums"]["location_type"]>)) as unknown as {
          data: Array<{
            therapist_id: string;
            location_type: string;
            region: string | null;
          }> | null;
          error: unknown;
        },
      );

      const byTherapist = new Map<string, Array<{ location_type: string; region_slug: string | null }>>();
      for (const r of rows ?? []) {
        const list = byTherapist.get(r.therapist_id) ?? [];
        list.push({
          location_type: r.location_type,
          region_slug: regionSlugForStoredValue(r.region),
        });
        byTherapist.set(r.therapist_id, list);
      }

      const matched = new Set<string>();
      for (const [id, locs] of byTherapist) {
        if (matchesLocationAvailability(locs, filter)) matched.add(id);
      }
      return filterByEligible(matched, await eligibleIds());
    },
    async idsByGender(gender) {
      const rows = unwrap(
        (await applyEligibility(sb.from("therapists").select("id").eq("gender", gender))) as unknown as {
          data: Array<{ id: string }> | null;
          error: unknown;
        },
      );
      return new Set(rows.map((r) => r.id));
    },
    async idsByTherapyFormats(slugs) {
      if (slugs.length === 0) return new Set();
      const rows = unwrap(
        (await sb
          .from("therapist_therapy_formats")
          .select("therapist_id, therapy_formats!inner(slug)")
          .in("therapy_formats.slug", slugs)) as unknown as {
          data: Array<{ therapist_id: string }> | null;
          error: unknown;
        },
      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByProfileAttributes(filter) {
      let therapistQuery = applyEligibility(sb.from("therapists").select("id"));
      if (filter.verifiedOnly) therapistQuery = therapistQuery.eq("verified", true);
      if (filter.lgbtqAffirming) therapistQuery = therapistQuery.eq("lgbtq_affirming", true);
      if (filter.freeIntroOnly) therapistQuery = therapistQuery.eq("offers_free_intro", true);
      const therapistRows = unwrap(
        (await therapistQuery) as unknown as { data: Array<{ id: string }> | null; error: unknown },
      );
      let ids = new Set(therapistRows.map((row) => row.id));
      if (filter.accessibleClinic) {
        const locationRows = unwrap(
          (await sb
            .from("therapist_locations")
            .select("therapist_id")
            .eq("is_active", true)
            .eq("location_type", "clinic")
            .eq("accessibility_status", "accessible")) as unknown as {
            data: Array<{ therapist_id: string }> | null;
            error: unknown;
          },
        );
        const accessibleIds = collect(locationRows);
        ids = new Set([...ids].filter((id) => accessibleIds.has(id)));
      }
      return filterByEligible(ids, await eligibleIds());
    },
    async hydrate(ids): Promise<HydratedCandidate[]> {
      if (ids.length === 0) return [];
      const [tRes, profRes, modRes, popRes, langRes, locRes] = await Promise.all([
        applyEligibility(
          sb
            .from("therapists")
            .select("id, verified, image_url, gender, years_experience, full_description, semantic_profile"),
        ).in("id", ids),
        sb.from("therapist_professions").select("therapist_id, professions!inner(slug)").in("therapist_id", ids),
        sb
          .from("therapist_modalities")
          .select("therapist_id, treatment_modalities!inner(slug)")
          .in("therapist_id", ids),
        sb.from("therapist_populations").select("therapist_id, population_groups!inner(slug)").in("therapist_id", ids),
        sb.from("therapist_languages").select("therapist_id, languages!inner(code)").in("therapist_id", ids),
        sb
          .from("therapist_locations")
          .select("therapist_id, city, location_type")
          .eq("is_active", true)
          .in("therapist_id", ids),
      ]);
      for (const r of [tRes, profRes, modRes, popRes, langRes, locRes]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = (r as any).error;
        if (err) throw err;
      }

      const tRows = (tRes.data ?? []) as Array<{
        id: string;
        verified: boolean | null;
        image_url: string | null;
        gender: string | null;
        years_experience: number | null;
        full_description: string | null;
        semantic_profile: unknown;
      }>;
      const pushInto = <V,>(m: Map<string, V[]>, k: string, v: V) => {
        const arr = m.get(k);
        if (arr) arr.push(v);
        else m.set(k, [v]);
      };
      const profBy = new Map<string, string[]>();
      for (const r of (profRes.data ?? []) as Array<{
        therapist_id: string;
        professions: { slug: string };
      }>) {
        if (r.professions?.slug) pushInto(profBy, r.therapist_id, r.professions.slug);
      }
      const modBy = new Map<string, string[]>();
      for (const r of (modRes.data ?? []) as Array<{
        therapist_id: string;
        treatment_modalities: { slug: string };
      }>) {
        if (r.treatment_modalities?.slug) pushInto(modBy, r.therapist_id, r.treatment_modalities.slug);
      }
      const popBy = new Map<string, string[]>();
      for (const r of (popRes.data ?? []) as Array<{
        therapist_id: string;
        population_groups: { slug: string };
      }>) {
        if (r.population_groups?.slug) pushInto(popBy, r.therapist_id, r.population_groups.slug);
      }
      const langBy = new Map<string, string[]>();
      for (const r of (langRes.data ?? []) as Array<{
        therapist_id: string;
        languages: { code: string };
      }>) {
        if (r.languages?.code) pushInto(langBy, r.therapist_id, r.languages.code);
      }
      const cityBy = new Map<string, string[]>();
      const deliveryBy = new Map<string, string[]>();
      for (const r of (locRes.data ?? []) as Array<{
        therapist_id: string;
        city: string | null;
        location_type: string | null;
      }>) {
        if (r.city) pushInto(cityBy, r.therapist_id, r.city);
        if (r.location_type) pushInto(deliveryBy, r.therapist_id, r.location_type);
      }

      return tRows.map((t) => {
        const bio = t.full_description ?? "";
        const g: TherapistGender | null = t.gender === "male" || t.gender === "female" ? t.gender : null;
        return {
          id: t.id,
          gender: g,
          professionSlugs: profBy.get(t.id) ?? [],
          modalitySlugs: modBy.get(t.id) ?? [],
          populationSlugs: popBy.get(t.id) ?? [],
          languageCodes: langBy.get(t.id) ?? [],
          cities: cityBy.get(t.id) ?? [],
          deliveryModes: deliveryBy.get(t.id) ?? [],
          semanticProfile: parseStoredProfile(t.semantic_profile),
          qualitySignals: {
            verified: !!t.verified,
            hasImage: !!t.image_url,
            bioLength: bio.length,
          },
          yearsExperience: t.years_experience ?? 0,
        };
      });
    },
    async fetchDisplay(ids): Promise<Map<string, DisplayRow>> {
      const map = new Map<string, DisplayRow>();
      if (ids.length === 0) return map;
      // Batched display relations for the final result ids only (no N+1).
      const [tRes, locRes, langRes, popRes, modRes] = await Promise.all([
        applyEligibility(
          sb
            .from("therapists")
            .select(
              "id, slug, full_name, professional_title, image_url, verified, short_intro, years_experience, lgbtq_affirming, offers_free_intro",
            ),
        ).in("id", ids),
        sb
          .from("therapist_locations")
          .select("therapist_id, location_type, city, region, is_primary")
          .eq("is_active", true)
          .in("therapist_id", ids),
        sb.from("therapist_languages").select("therapist_id, languages!inner(name)").in("therapist_id", ids),
        sb.from("therapist_populations").select("therapist_id, population_groups!inner(name)").in("therapist_id", ids),
        sb
          .from("therapist_modalities")
          .select("therapist_id, treatment_modalities!inner(name:name_he, sort_order, is_active)")
          .eq("treatment_modalities.is_active", true)
          .in("therapist_id", ids),
      ]);
      for (const r of [tRes, locRes, langRes, popRes, modRes]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = (r as any).error;
        if (err) throw err;
      }

      const locBy = new Map<string, ActiveLocationRow[]>();
      for (const r of (locRes.data ?? []) as Array<{
        therapist_id: string;
        location_type: string;
        city: string | null;
        region: string | null;
        is_primary: boolean | null;
      }>) {
        const list = locBy.get(r.therapist_id) ?? [];
        list.push({
          location_type: r.location_type,
          city: r.city,
          region: r.region,
          is_primary: r.is_primary,
        });
        locBy.set(r.therapist_id, list);
      }
      const langBy = new Map<string, string[]>();
      for (const r of (langRes.data ?? []) as Array<{
        therapist_id: string;
        languages: { name: string } | null;
      }>) {
        if (!r.languages?.name) continue;
        const list = langBy.get(r.therapist_id) ?? [];
        if (!list.includes(r.languages.name)) list.push(r.languages.name);
        langBy.set(r.therapist_id, list);
      }
      const popBy = new Map<string, string[]>();
      for (const r of (popRes.data ?? []) as Array<{
        therapist_id: string;
        population_groups: { name: string } | null;
      }>) {
        if (!r.population_groups?.name) continue;
        const list = popBy.get(r.therapist_id) ?? [];
        if (!list.includes(r.population_groups.name)) list.push(r.population_groups.name);
        popBy.set(r.therapist_id, list);
      }
      const modalityBy = new Map<string, Array<{ name: string; sort_order: number }>>();
      for (const r of (modRes.data ?? []) as Array<{
        therapist_id: string;
        treatment_modalities: { name: string; sort_order: number | null } | null;
      }>) {
        if (!r.treatment_modalities?.name) continue;
        const list = modalityBy.get(r.therapist_id) ?? [];
        if (!list.some((item) => item.name === r.treatment_modalities?.name)) {
          list.push({
            name: r.treatment_modalities.name,
            sort_order: r.treatment_modalities.sort_order ?? 0,
          });
        }
        modalityBy.set(r.therapist_id, list);
      }

      for (const r of (tRes.data ?? []) as Array<{
        id: string;
        slug: string;
        full_name: string;
        professional_title: string | null;
        image_url: string | null;
        verified: boolean | null;
        short_intro: string | null;
        lgbtq_affirming: boolean | null;
        offers_free_intro: boolean | null;
      }>) {
        const loc = buildCardLocationDisplay(locBy.get(r.id) ?? [], resolveStoredRegion);
        map.set(r.id, {
          slug: r.slug,
          full_name: r.full_name,
          professional_title: r.professional_title,
          image_url: r.image_url,
          verified: !!r.verified,
          short_intro: r.short_intro,
          primary_clinic: loc.primary_clinic,
          additional_clinic_count: loc.additional_clinic_count,
          online_available: loc.online_available,
          home_visit_regions: loc.home_visit_regions,
          language_names: langBy.get(r.id) ?? [],
          population_names: popBy.get(r.id) ?? [],
          modality_names: (modalityBy.get(r.id) ?? [])
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "he"))
            .map((item) => item.name),
          lgbtq_affirming: !!r.lgbtq_affirming,
          offers_free_intro: !!r.offers_free_intro,
          primary_clinic_fallback_used: loc.primary_clinic_fallback_used,
        });
      }
      return map;
    },
  };
}

export async function runUnifiedSearch(
  args: { query: string; explicit: RawExplicitFilters; limit: number },
  client?: SupabaseClient<Database>,
): Promise<UnifiedSearchResult> {
  const sb = client ?? (await serverClient());
  const { plan } = await buildPlan(args.query, args.explicit, sb);
  const repo = createSupabaseRepo(sb);
  const out = await executeUnifiedSearch(repo, plan, args.limit);
  return {
    plan,
    results: out.results,
    emptyReason: out.emptyReason,
    primaryClinicFallbackCount: out.primaryClinicFallbackCount,
  };
}

export const interpretQueryFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InterpretInput.parse(input))
  .handler(async ({ data }): Promise<InterpretationResult> => {
    const catalog = await loadSearchCatalog();
    return interpretQuery(data.query, catalog);
  });

export const unifiedSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<UnifiedSearchResult> => {
    return runUnifiedSearch({
      query: data.query,
      explicit: {
        city: data.city,
        population: data.population,
        language: data.language,
        regions: data.regions,
        serviceTypes: data.serviceTypes,
        professions: data.professions,
        modalities: data.modalities,
        therapyFormats: data.therapyFormats,
        gender: data.gender,
        accessible: data.accessible,
        verified: data.verified,
        lgbtqAffirming: data.lgbtqAffirming,
        freeIntro: data.freeIntro,
      },
      limit: data.limit ?? 20,
    });
  });
