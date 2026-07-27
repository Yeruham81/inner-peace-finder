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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { SemanticEngine } from "./semantic-engine";
import { parseStoredProfile } from "./therapist-semantic-profile";
import { loadSearchCatalog } from "./query-catalog";
import { interpretQuery } from "./query-interpreter";
import { applyEligibility } from "./search-eligibility";
import {
  executeUnifiedSearch,
  type DisplayRow,
  type HydratedCandidate,
  type TherapistRepo,
} from "./unified-search-executor";
import type {
  InterpretationResult,
  SemanticSignal,
  TherapistGender,
  TherapistSearchPlan,
} from "./query-interpreter.types";

const Input = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(50).optional(),
});

function serverClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export type UnifiedSearchResult = {
  plan: TherapistSearchPlan;
  results: Array<{
    id: string;
    slug: string;
    full_name: string;
    professional_title: string | null;
    image_url: string | null;
    city: string | null;
    verified: boolean;
    semanticScore: number;
    preferenceScore: number;
    qualityScore: number;
    yearsExperience: number;
  }>;
  emptyReason: null | "unrecognized_query" | "no_matching_therapists";
};

/**
 * Throw on Supabase read failure so the executor never mistakes a failed
 * query for an empty result. Callers pass the tuple returned by supabase-js.
 */
function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return (res.data ?? ([] as unknown as T));
}

async function buildPlan(
  query: string,
  sb: SupabaseClient<Database>,
): Promise<{ plan: TherapistSearchPlan; interpretation: InterpretationResult }> {
  const catalog = await loadSearchCatalog();
  const interpretation = interpretQuery(query, catalog);
  let semanticSignals: SemanticSignal[] = [];
  if (interpretation.semanticRemainder.length > 0 && !interpretation.unresolvedPrimary) {
    const classified = await SemanticEngine.classify(interpretation.semanticRemainder, sb);
    semanticSignals = classified.map((c) => ({ slug: c.slug, confidence: c.confidence }));
  }
  const plan: TherapistSearchPlan = {
    interpretation,
    semanticSignals,
    hardFilters: interpretation.hardFilters,
    softPreferences: interpretation.softPreferences,
    therapistNameIds: interpretation.therapistNameIds,
    emptyReason: interpretation.unresolvedPrimary ? "unrecognized_query" : null,
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
      await applyEligibility(sb.from("therapists").select("id")) as unknown as {
        data: Array<{ id: string }> | null; error: unknown;
      },    );
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
        await sb
          .from("therapist_professions")
          .select("therapist_id, professions!inner(slug)")
          .in("professions.slug", slugs) as unknown as {
            data: Array<{ therapist_id: string }> | null; error: unknown;
          },      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByModalities(slugs) {
      if (slugs.length === 0) return new Set();
      const rows = unwrap(
        await sb
          .from("therapist_modalities")
          .select("therapist_id, treatment_modalities!inner(slug)")
          .in("treatment_modalities.slug", slugs) as unknown as {
            data: Array<{ therapist_id: string }> | null; error: unknown;
          },      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByPopulations(slugs) {
      if (slugs.length === 0) return new Set();
      const rows = unwrap(
        await sb
          .from("therapist_populations")
          .select("therapist_id, population_groups!inner(slug)")
          .in("population_groups.slug", slugs) as unknown as {
            data: Array<{ therapist_id: string }> | null; error: unknown;
          },      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByLanguages(codes) {
      if (codes.length === 0) return new Set();
      const rows = unwrap(
        await sb
          .from("therapist_languages")
          .select("therapist_id, languages!inner(code)")
          .in("languages.code", codes) as unknown as {
            data: Array<{ therapist_id: string }> | null; error: unknown;
          },      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByCities(cities) {
      if (cities.length === 0) return new Set();
      const rows = unwrap(
        await sb
          .from("therapist_locations")
          .select("therapist_id")
          .eq("is_active", true)
          .in("city", cities) as unknown as {
            data: Array<{ therapist_id: string }> | null; error: unknown;
          },      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByDeliveryModes(modes) {
      if (modes.length === 0) return new Set();
      const rows = unwrap(
        await sb
          .from("therapist_locations")
          .select("therapist_id")
          .eq("is_active", true)
          .in(
            "location_type",
            modes as Array<Database["public"]["Enums"]["location_type"]>,
          ) as unknown as {
            data: Array<{ therapist_id: string }> | null; error: unknown;
          },      );
      return filterByEligible(collect(rows), await eligibleIds());
    },
    async idsByGender(gender) {
      const rows = unwrap(
        await applyEligibility(
          sb.from("therapists").select("id").eq("gender", gender),
        ) as unknown as { data: Array<{ id: string }> | null; error: unknown },
      );
      return new Set(rows.map((r) => r.id));
    },
    async hydrate(ids): Promise<HydratedCandidate[]> {
      if (ids.length === 0) return [];
      const [tRes, profRes, modRes, popRes, langRes, locRes] = await Promise.all([
        applyEligibility(
          sb
            .from("therapists")
            .select(
              "id, verified, image_url, gender, years_experience, full_description, semantic_profile",
            ),
        ).in("id", ids),
        sb
          .from("therapist_professions")
          .select("therapist_id, professions!inner(slug)")
          .in("therapist_id", ids),
        sb
          .from("therapist_modalities")
          .select("therapist_id, treatment_modalities!inner(slug)")
          .in("therapist_id", ids),
        sb
          .from("therapist_populations")
          .select("therapist_id, population_groups!inner(slug)")
          .in("therapist_id", ids),
        sb
          .from("therapist_languages")
          .select("therapist_id, languages!inner(code)")
          .in("therapist_id", ids),
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
      const pushInto = <V>(m: Map<string, V[]>, k: string, v: V) => {
        const arr = m.get(k);
        if (arr) arr.push(v);
        else m.set(k, [v]);
      };
      const profBy = new Map<string, string[]>();
      for (const r of (profRes.data ?? []) as Array<{ therapist_id: string; professions: { slug: string } }>) {
        if (r.professions?.slug) pushInto(profBy, r.therapist_id, r.professions.slug);
      }
      const modBy = new Map<string, string[]>();
      for (const r of (modRes.data ?? []) as Array<{ therapist_id: string; treatment_modalities: { slug: string } }>) {
        if (r.treatment_modalities?.slug) pushInto(modBy, r.therapist_id, r.treatment_modalities.slug);
      }
      const popBy = new Map<string, string[]>();
      for (const r of (popRes.data ?? []) as Array<{ therapist_id: string; population_groups: { slug: string } }>) {
        if (r.population_groups?.slug) pushInto(popBy, r.therapist_id, r.population_groups.slug);
      }
      const langBy = new Map<string, string[]>();
      for (const r of (langRes.data ?? []) as Array<{ therapist_id: string; languages: { code: string } }>) {
        if (r.languages?.code) pushInto(langBy, r.therapist_id, r.languages.code);
      }
      const cityBy = new Map<string, string[]>();
      const deliveryBy = new Map<string, string[]>();
      for (const r of (locRes.data ?? []) as Array<{
        therapist_id: string; city: string | null; location_type: string | null;
      }>) {
        if (r.city) pushInto(cityBy, r.therapist_id, r.city);
        if (r.location_type) pushInto(deliveryBy, r.therapist_id, r.location_type);
      }

      return tRows.map((t) => {
        const bio = t.full_description ?? "";
        const g: TherapistGender | null =
          t.gender === "male" || t.gender === "female" ? t.gender : null;
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
      const res = await applyEligibility(
        sb.from("therapists").select(
          "id, slug, full_name, professional_title, image_url, city, verified",
        ),
      ).in("id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((res as any).error) throw (res as any).error;
      for (const r of (res.data ?? []) as Array<{
        id: string; slug: string; full_name: string; professional_title: string | null;
        image_url: string | null; city: string | null; verified: boolean | null;
      }>) {
        map.set(r.id, {
          slug: r.slug, full_name: r.full_name,
          professional_title: r.professional_title,
          image_url: r.image_url, city: r.city, verified: !!r.verified,
        });
      }
      return map;
    },
  };
}

async function runUnifiedSearch(query: string, limit: number): Promise<UnifiedSearchResult> {
  const sb = serverClient();
  const { plan } = await buildPlan(query, sb);
  const repo = createSupabaseRepo(sb);
  const out = await executeUnifiedSearch(repo, plan, limit);
  return { plan, results: out.results, emptyReason: out.emptyReason };
}

export const interpretQueryFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<InterpretationResult> => {
    const catalog = await loadSearchCatalog();
    return interpretQuery(data.query, catalog);
  });

export const unifiedSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<UnifiedSearchResult> => {
    return runUnifiedSearch(data.query, data.limit ?? 20);
  });