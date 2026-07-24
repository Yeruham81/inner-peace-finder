/**
 * Phase Q1 v4 — server-function orchestration for the unified search flow.
 * Client entrypoints:
 *   - `interpretQueryFn`  → returns interpretation only.
 *   - `unifiedSearch`     → full pipeline: interpret + seed + rank.
 *
 * All DB access is centralized here. Pure logic is delegated to
 * `query-interpreter.ts` and `unified-search.ts`.
 */

import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { SemanticEngine } from "./semantic-engine";
import { loadSearchCatalog } from "./query-catalog";
import { interpretQuery } from "./query-interpreter";
import { applyEligibility } from "./search-eligibility";
import {
  applySemanticGate,
  computeQualityScore,
  computeSemanticScore,
  rankCandidates,
  type RankedCandidate,
} from "./unified-search";
import type {
  CandidateForRanking,
  InterpretationResult,
  SemanticSignal,
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

async function seedCandidateIds(
  sb: SupabaseClient<Database>,
  plan: TherapistSearchPlan,
): Promise<Set<string> | null> {
  const hard = plan.hardFilters;

  const { data: eligibleRows } = await applyEligibility(sb.from("therapists").select("id"));
  const eligible = new Set<string>((eligibleRows ?? []).map((r: { id: string }) => r.id));

  if (plan.therapistNameIds.length > 0) {
    return new Set(plan.therapistNameIds.filter((id) => eligible.has(id)));
  }

  const sets: Set<string>[] = [];

  if (hard.professionSlugs.length > 0) {
    const { data } = await sb
      .from("therapist_professions")
      .select("therapist_id, professions!inner(slug)")
      .in("professions.slug", hard.professionSlugs);
    sets.push(
      new Set(
        ((data ?? []) as Array<{ therapist_id: string }>)
          .map((r) => r.therapist_id)
          .filter((id) => eligible.has(id)),
      ),
    );
  }
  if (hard.modalitySlugs.length > 0) {
    const { data } = await sb
      .from("therapist_modalities")
      .select("therapist_id, treatment_modalities!inner(slug)")
      .in("treatment_modalities.slug", hard.modalitySlugs);
    sets.push(
      new Set(
        ((data ?? []) as Array<{ therapist_id: string }>)
          .map((r) => r.therapist_id)
          .filter((id) => eligible.has(id)),
      ),
    );
  }
  if (hard.city) {
    const { data } = await sb
      .from("therapist_locations")
      .select("therapist_id")
      .eq("is_active", true)
      .eq("city", hard.city);
    sets.push(
      new Set(
        ((data ?? []) as Array<{ therapist_id: string }>)
          .map((r) => r.therapist_id)
          .filter((id) => eligible.has(id)),
      ),
    );
  }
  if (hard.therapistGender) {
    const { data } = await sb.from("therapists").select("id").eq("gender", hard.therapistGender);
    sets.push(
      new Set(
        ((data ?? []) as Array<{ id: string }>)
          .map((r) => r.id)
          .filter((id) => eligible.has(id)),
      ),
    );
  }

  if (sets.length === 0) return null;
  const [first, ...rest] = sets;
  let inter = first;
  for (const s of rest) inter = new Set([...inter].filter((id) => s.has(id)));
  return inter;
}

type HydratedCandidate = CandidateForRanking & { semanticSlugs: string[] };

async function hydrateCandidates(
  sb: SupabaseClient<Database>,
  ids: string[],
): Promise<HydratedCandidate[]> {
  if (ids.length === 0) return [];
  const [tRes, profRes, modRes, locRes] = await Promise.all([
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
      .from("therapist_locations")
      .select("therapist_id, city, location_type")
      .eq("is_active", true)
      .in("therapist_id", ids),
  ]);
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
  const cityBy = new Map<string, string[]>();
  const deliveryBy = new Map<string, string[]>();
  for (const r of (locRes.data ?? []) as Array<{ therapist_id: string; city: string | null; location_type: string | null }>) {
    if (r.city) pushInto(cityBy, r.therapist_id, r.city);
    if (r.location_type) pushInto(deliveryBy, r.therapist_id, r.location_type);
  }

  const semSlugsFromProfile = (raw: unknown): string[] => {
    if (!raw || typeof raw !== "object") return [];
    const p = raw as { domains?: Array<{ slug?: string }> };
    return (p.domains ?? []).map((d) => d?.slug).filter((s): s is string => !!s);
  };

  return tRows.map((t) => {
    const bio = t.full_description ?? "";
    return {
      therapistId: t.id,
      professionSlugs: profBy.get(t.id) ?? [],
      modalitySlugs: modBy.get(t.id) ?? [],
      populationSlugs: [],
      languageCodes: [],
      cities: cityBy.get(t.id) ?? [],
      deliveryModes: deliveryBy.get(t.id) ?? [],
      gender: (t.gender === "male" || t.gender === "female") ? t.gender : null,
      yearsExperience: t.years_experience ?? 0,
      qualityScore: computeQualityScore({
        yearsExperience: t.years_experience ?? 0,
        verified: !!t.verified,
        hasImage: !!t.image_url,
        bioLength: bio.length,
      }),
      semanticScore: 0,
      semanticSlugs: semSlugsFromProfile(t.semantic_profile),
    };
  });
}

async function fetchDisplayRows(
  sb: SupabaseClient<Database>,
  ids: string[],
) {
  const map = new Map<string, {
    slug: string; full_name: string; professional_title: string | null;
    image_url: string | null; city: string | null; verified: boolean;
  }>();
  if (ids.length === 0) return map;
  const { data } = await applyEligibility(
    sb.from("therapists").select("id, slug, full_name, professional_title, image_url, city, verified"),
  ).in("id", ids);
  for (const r of (data ?? []) as Array<{
    id: string; slug: string; full_name: string; professional_title: string | null;
    image_url: string | null; city: string | null; verified: boolean | null;
  }>) {
    map.set(r.id, {
      slug: r.slug, full_name: r.full_name,
      professional_title: r.professional_title,
      image_url: r.image_url, city: r.city,
      verified: !!r.verified,
    });
  }
  return map;
}

async function runUnifiedSearch(query: string, limit: number): Promise<UnifiedSearchResult> {
  const sb = serverClient();
  const { plan } = await buildPlan(query, sb);
  if (plan.emptyReason === "unrecognized_query") {
    return { plan, results: [], emptyReason: "unrecognized_query" };
  }

  let seedIds = await seedCandidateIds(sb, plan);
  if (seedIds === null) {
    // Semantic-only or purely descriptive query — seed from eligible therapists.
    const { data } = await applyEligibility(sb.from("therapists").select("id")).limit(500);
    seedIds = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  }
  if (seedIds.size === 0) {
    return { plan, results: [], emptyReason: "no_matching_therapists" };
  }

  const candidates = await hydrateCandidates(sb, Array.from(seedIds));

  const withSemantic = candidates.map((c) => {
    const { score, overlapCount } = computeSemanticScore(new Set(c.semanticSlugs), plan.semanticSignals);
    return { ...c, semanticScore: score, semanticOverlap: overlapCount };
  });
  const gated = applySemanticGate(withSemantic, plan.semanticSignals.length > 0);

  const ranked: RankedCandidate[] = rankCandidates(gated, plan.softPreferences);
  const top = ranked.slice(0, limit);
  const display = await fetchDisplayRows(sb, top.map((r) => r.therapistId));

  const results = top
    .map((r) => {
      const d = display.get(r.therapistId);
      if (!d) return null;
      return {
        id: r.therapistId,
        slug: d.slug,
        full_name: d.full_name,
        professional_title: d.professional_title,
        image_url: d.image_url,
        city: d.city,
        verified: d.verified,
        semanticScore: r.semanticScore,
        preferenceScore: r.preferenceScore,
        qualityScore: r.qualityScore,
        yearsExperience: r.yearsExperience,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return {
    plan,
    results,
    emptyReason: results.length === 0 ? "no_matching_therapists" : null,
  };
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