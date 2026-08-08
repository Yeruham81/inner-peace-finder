import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { classifyQuery, type ClassificationResult } from "./semantic-classifier";
import { SemanticEngine } from "./semantic-engine";
import {
  buildClarificationPrompt,
  needsClarification,
  type ClarificationPrompt,
} from "./search-clarification";
import {
  parseStoredProfile,
  type SemanticProfileEntry,
} from "./therapist-semantic-profile";
import { applyEligibility } from "./search-eligibility";
import {
  fetchPublicTherapistBySlug,
  listEligibleFilterOptions,
  listEligibleTherapistSlugs,
} from "./public-therapist-queries";

async function publicClient() {
  // Public reads run through the server-only trusted client: `anon` has no
  // direct privileges on public.therapists. Eligibility is still applied.
  const { trustedReadClient } = await import("./trusted-read-client.server");
  return trustedReadClient();
}

export type ScoredTherapist = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string | null;
  short_intro: string | null;
  years_experience: number;
  city: string | null;
  image_url: string | null;
  verified: boolean;
  score: number;
  matched_problem_slugs: string[];
  population_names: string[];
  language_names: string[];
};

const SearchSchema = z.object({
  query: z.string().trim().max(200).optional().nullable(),
  problemSlug: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  populationSlug: z.string().trim().max(40).optional().nullable(),
  languageCode: z.string().trim().max(8).optional().nullable(),
});

/**
 * Problem-first search. Combines intent/alias mapping with structured filters
 * and computes a deterministic score per therapist.
 */
export const searchTherapists = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SearchSchema.parse(input))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const q = (data.query ?? "").trim();

    // 1) Intent / alias / problem-name → matching problem IDs
    const matchedProblemIds = new Set<string>();
    const intentProblemIds = new Set<string>();
    let parentAnxietyId: string | null = null;
    // Slugs matched by the classifier (or structured problem filter). Used
    // for semantic_profile (JSONB) based candidate filtering — replaces the
    // stale `therapist_problems.problem_id` join whose UUIDs no longer
    // reference `problems.id` (bigint) after the semantic-profile migration.
    const matchedSlugs = new Set<string>();

    const { data: anxietyParent } = await sb.from("problems").select("id").eq("slug", "anxiety").maybeSingle();
    parentAnxietyId = anxietyParent?.id !== undefined && anxietyParent?.id !== null ? String(anxietyParent.id) : null;

    if (q.length >= 2) {
      // Phase 5/6: flexible, token-aware matching against the full vocabulary
      // — same engine the classifier uses. Avoids strict ILIKE brittleness.
      const cls = await classifyQuery(q, sb);
      if (cls.matches.length > 0) {
        const slugs = cls.matches.map((m) => m.slug);
        slugs.forEach((s) => matchedSlugs.add(s));
        const { data: pRows } = await sb
          .from("problems")
          .select("id, slug")
          .in("slug", slugs);
        pRows?.forEach((r) => matchedProblemIds.add(String((r as { id: string | number }).id)));
      }
    }

    // Structured problem filter
    let filterProblemId: string | null = null;
    if (data.problemSlug) {
      matchedSlugs.add(data.problemSlug);
      const { data: p } = await sb.from("problems").select("id").eq("slug", data.problemSlug).maybeSingle();
      filterProblemId = p?.id !== undefined && p?.id !== null ? String(p.id) : null;
      if (filterProblemId) matchedProblemIds.add(filterProblemId);
    }

    // Resolve population & language ids for filter
    let filterPopulationId: string | null = null;
    if (data.populationSlug) {
      const { data: pop } = await sb
        .from("population_groups")
        .select("id")
        .eq("slug", data.populationSlug)
        .maybeSingle();
      filterPopulationId = pop?.id ?? null;
    }
    let filterLanguageId: string | null = null;
    if (data.languageCode) {
      const { data: lang } = await sb.from("languages").select("id").eq("code", data.languageCode).maybeSingle();
      filterLanguageId = lang?.id ?? null;
    }

    // 2) Candidate therapist ids — semantic_profile (JSONB) driven.
    //   The legacy `therapist_problems` join is intentionally NOT used for
    //   candidate selection: its `problem_id` (uuid) no longer references
    //   `problems.id` (bigint) in the current schema, so it returns 0 rows
    //   for every classified slug and silently zeroed out all searches.
    //   Semantic filtering by slug now happens post-load against
    //   `therapists.semantic_profile` (which is the SOT after Phase 4).
    let candidateIds: Set<string> | null = null;
    if (filterPopulationId) {
      const { data: tps } = await sb
        .from("therapist_populations")
        .select("therapist_id")
        .eq("population_id", filterPopulationId);
      const popSet = new Set(tps?.map((r) => r.therapist_id) ?? []);
      candidateIds = candidateIds ? new Set([...candidateIds].filter((id) => popSet.has(id))) : popSet;
    }
    if (filterLanguageId) {
      const { data: tls } = await sb
        .from("therapist_languages")
        .select("therapist_id")
        .eq("language_id", filterLanguageId);
      const langSet = new Set(tls?.map((r) => r.therapist_id) ?? []);
      candidateIds = candidateIds ? new Set([...candidateIds].filter((id) => langSet.has(id))) : langSet;
    }

    // 3) Load therapists (filter by candidate set if any; otherwise everyone)
    let tq = applyEligibility(
      sb
        .from("therapists")
        .select(
          "id, slug, full_name, professional_title, short_intro, full_description, years_experience, city, image_url, verified, is_active, semantic_profile",
        ),
    );
    if (candidateIds) {
      if (candidateIds.size === 0) return [] as ScoredTherapist[];
      tq = tq.in("id", Array.from(candidateIds));
    }
    if (data.city) tq = tq.eq("city", data.city);
    const { data: therapists, error } = await tq;
    if (error) throw new Error(error.message);
    if (!therapists || therapists.length === 0) return [] as ScoredTherapist[];

    // Semantic-profile eligibility: keep only therapists whose stored
    // `semantic_profile` overlaps with any matched slug. Falls back to
    // "keep all" when we have no slugs to match against (e.g. no query and
    // no problem filter — the "browse all" case).
    const eligibleTherapists = matchedSlugs.size === 0
      ? therapists
      : therapists.filter((t) => {
          const profile = parseStoredProfile(
            (t as unknown as { semantic_profile?: unknown }).semantic_profile,
          );
          if (profile.length === 0) return false;
          return profile.some((e) => matchedSlugs.has(e.slug));
        });
    if (eligibleTherapists.length === 0) return [] as ScoredTherapist[];
    const ids = eligibleTherapists.map((t) => t.id);

    // 4) Load relations for scoring + display
    const [{ data: tpRows }, { data: tpopRows }, { data: tlangRows }] = await Promise.all([
      sb
        .from("therapist_problems")
        .select("therapist_id, problem_id")
        .in("therapist_id", ids),
      sb.from("therapist_populations").select("therapist_id, population_groups(slug, name)").in("therapist_id", ids),
      sb.from("therapist_languages").select("therapist_id, languages(code, name)").in("therapist_id", ids),
    ]);

    // Resolve problem details separately — the FK types between
    // therapist_problems.problem_id and problems.id do not embed cleanly.
    type ProblemJoin = { slug: string; parent_id: string | null } | null;
    const problemIdsInJoin = Array.from(
      new Set((tpRows ?? []).map((r) => String(r.problem_id))),
    );
    const problemLookup = new Map<string, { slug: string; parent_id: string | null }>();
    if (problemIdsInJoin.length > 0) {
      const { data: pRows } = await sb
        .from("problems")
        .select("id, slug, parent_id")
        .in("id", problemIdsInJoin as unknown as number[]);
      (pRows ?? []).forEach((p) => {
        const row = p as { id: string | number; slug: string; parent_id: string | number | null };
        problemLookup.set(String(row.id), {
          slug: row.slug,
          parent_id: row.parent_id !== null && row.parent_id !== undefined ? String(row.parent_id) : null,
        });
      });
    }
    const tpByT = new Map<string, { problem_id: string; problem: ProblemJoin }[]>();
    (tpRows ?? []).forEach((r) => {
      const key = r.therapist_id;
      const pid = String(r.problem_id);
      const arr = tpByT.get(key) ?? [];
      arr.push({ problem_id: pid, problem: problemLookup.get(pid) ?? null });
      tpByT.set(key, arr);
    });
    const popsByT = new Map<string, { slug: string; name: string }[]>();
    tpopRows?.forEach((r) => {
      const arr = popsByT.get(r.therapist_id) ?? [];
      if (r.population_groups) arr.push(r.population_groups as { slug: string; name: string });
      popsByT.set(r.therapist_id, arr);
    });
    const langsByT = new Map<string, { code: string; name: string }[]>();
    tlangRows?.forEach((r) => {
      const arr = langsByT.get(r.therapist_id) ?? [];
      if (r.languages) arr.push(r.languages as { code: string; name: string });
      langsByT.set(r.therapist_id, arr);
    });

    // 5) Score
    const results: ScoredTherapist[] = eligibleTherapists.map((t) => {
      const tps = tpByT.get(t.id) ?? [];
      let score = 0;
      const matchedSlugs = new Set<string>();

      for (const tp of tps) {
        const isExactSubtype =
          (filterProblemId && tp.problem_id === filterProblemId) ||
          (matchedProblemIds.has(tp.problem_id) && tp.problem?.slug !== "anxiety");
        const isParentAnxiety = tp.problem_id === parentAnxietyId || tp.problem?.slug === "anxiety";
        const isIntentMatch = intentProblemIds.has(tp.problem_id);

        if (isExactSubtype) {
          score += 50;
          if (tp.problem?.slug) matchedSlugs.add(tp.problem.slug);
        } else if (isParentAnxiety && (q || filterProblemId)) {
          score += 25;
        }
        if (isIntentMatch) score += 20;
      }

      const pops = popsByT.get(t.id) ?? [];
      if (data.populationSlug && pops.some((p) => p.slug === data.populationSlug)) {
        score += 15;
      }

      if (data.city && t.city === data.city) score += 10;

      score += Math.min(20, Math.floor(t.years_experience / 2));
      if (t.verified) score += 5;

      // Phase 3 — additive profile-quality signals (no override of eligibility)
      if (t.image_url) score += 3;
      const bioLen = (t.short_intro?.length ?? 0) + (t.full_description?.length ?? 0);
      if (bioLen >= 400) score += 5;
      else if (bioLen >= 150) score += 2;

      return {
        id: t.id,
        slug: t.slug,
        full_name: t.full_name,
        professional_title: t.professional_title,
        short_intro: t.short_intro,
        years_experience: t.years_experience,
        city: t.city,
        image_url: t.image_url,
        verified: t.verified,
        score,
        matched_problem_slugs: Array.from(matchedSlugs),
        population_names: pops.map((p) => p.name),
        language_names: (langsByT.get(t.id) ?? []).map((l) => l.name),
      };
    });

    results.sort((a, b) => b.score - a.score || b.years_experience - a.years_experience);
    return results;
  });

export const listProblems = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await publicClient();
  const { data, error } = await sb
    .from("problems")
    .select("id, slug, description, parent_id, name:name_he")
    .order("name_he");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listFilterOptions = createServerFn({ method: "GET" }).handler(async () => {
  return listEligibleFilterOptions(await publicClient());
});

export const getProblemBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { data: problem } = await sb
      .from("problems")
      .select("id, slug, description, parent_id, name:name_he")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!problem) return null;
    const { data: children } = await sb
      .from("problems")
      .select("id, slug, description, name:name_he")
      .eq("parent_id", (problem as { id: string | number }).id as unknown as number)
      .order("name_he");
    return { ...problem, children: children ?? [] };
  });

export const getTherapistBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
    return fetchPublicTherapistBySlug(await publicClient(), data.slug);
  });

export const listAllTherapistSlugs = createServerFn({ method: "GET" }).handler(async () => {
  return listEligibleTherapistSlugs(await publicClient());
});

/* ------------------------------------------------------------------ */
/* Semantic search pipeline                                           */
/* ------------------------------------------------------------------ */

export type SearchPipelineResult =
  | {
      mode: "results";
      therapists: ScoredTherapist[];
      classification: ClassificationResult | null;
      normalizedQuery: string | null;
    }
  | {
      mode: "clarification";
      clarification: ClarificationPrompt;
      classification: ClassificationResult;
      normalizedQuery: string;
    };

/**
 * Future-LLM-ready intake pipeline:
 *   raw input
 *   → normalizeHebrew()
 *   → check query_classifications cache
 *   → on miss: classifyQuery() (mock today, LLM later) + store
 *   → confidence eval: if top < 0.65 → return clarification
 *   → otherwise hand off to the existing ranking engine unchanged
 *
 * Ranking logic is intentionally untouched; this only restructures intake.
 */
export const classifyAndSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SearchSchema.parse(input))
  .handler(async ({ data }): Promise<SearchPipelineResult> => {
    const sb = await publicClient();
    const rawQuery = (data.query ?? "").trim();
    const normalized = rawQuery ? SemanticEngine.normalize(rawQuery) : "";

    let classification: ClassificationResult | null = null;
    let cacheHit = false;

    // Only classify when there's a free-text query and the user hasn't
    // already locked a problem via the structured filter.
    if (normalized.length >= 2 && !data.problemSlug) {
      const { data: cached } = await sb
        .from("query_classifications")
        .select("result, source")
        .eq("normalized_query", normalized)
        .maybeSingle();

      if (cached?.result) {
        classification = cached.result as ClassificationResult;
        cacheHit = true;
      } else {
        classification = await classifyQuery(normalized, sb);
        // Best-effort cache write; never block search on a cache miss.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("query_classifications")
            .insert({
              normalized_query: normalized,
              // ClassificationResult is JSON-serializable; cast through unknown
              // to satisfy the generated `Json` column type.
              result: classification as unknown as never,
              source: classification.source ?? "mock",
            });
        } catch {
          // ignore — cache is an optimization, not a requirement
        }
      }

      if (classification && needsClarification(classification.matches)) {
        const clarification = await buildClarificationPrompt(classification.matches, sb);
        if (clarification.options.length >= 2) {
          await logSemanticSearch({
            raw_query: rawQuery || null,
            normalized_query: normalized || null,
            cache_hit: cacheHit,
            classifier_source: classification.source ?? null,
            matches: classification.matches,
            clarification_shown: true,
            clarification_selected: false,
            selected_problem_slug: null,
            result_count: 0,
          });
          return {
            mode: "clarification",
            clarification,
            classification,
            normalizedQuery: normalized,
          };
        }
      }
    }

    // Confident enough (or no semantic step at all) → existing ranker.
    let therapists = await searchTherapists({ data });
    const preRankCandidatesCount = therapists.length;

    // ----- Phase 3 (updated): Semantic therapist matching ------------------
    // Matching is now driven by each therapist's `semantic_profile` — derived
    // from their bio text — instead of taxonomy-based specialization tags.
    // Hard filters (population / city / is_active) are still enforced upstream
    // by `searchTherapists`; here we add:
    //   1) semantic eligibility (must overlap classifier candidates)
    //   2) similarity-weighted additive ranking bonus
    //   3) avg similarity for logging
    let filteredTherapistCount = 0;
    let avgSim: number | null = null;

    if (classification && classification.matches.length > 0 && therapists.length > 0) {
      // Fetch bio + stored semantic profile for the candidate set.
      const ids = therapists.map((t) => t.id);
      const { data: bioRows } = await sb
        .from("therapists")
        // SOT policy: `full_description` is the ONLY input for semantic
        // extraction. `short_intro` (UI) and `bio_raw` (staging) are
        // intentionally NOT read here.
        .select("id, full_description, semantic_profile")
        .in("id", ids);

      const profileByT = new Map<string, SemanticProfileEntry[]>();
      await Promise.all(
        (bioRows ?? []).map(async (r) => {
          const stored = parseStoredProfile(r.semantic_profile as unknown);
          if (stored.length > 0) {
            profileByT.set(r.id, stored);
            return;
          }
          // No stored profile → derive from full_description ONLY. Empty
          // full_description means "no extractable data available"; do NOT
          // fall back to any other field.
          const derived = r.full_description
            ? await SemanticEngine.extractProfile(r.full_description, sb)
            : [];
          profileByT.set(r.id, derived);
        }),
      );

      const sims: number[] = [];
      const scored = therapists.map((t) => {
        // Backward compat: if a therapist has neither semantic profile nor
        // extractable bio, fall back to taxonomy overlap from
        // matched_problem_slugs so pre-existing seed data still ranks.
        const profile = profileByT.get(t.id) ?? [];
        const effective: SemanticProfileEntry[] =
          profile.length > 0
            ? profile
            : t.matched_problem_slugs.map((slug) => ({ slug, weight: 1 }));
        const sim = SemanticEngine.scoreProfiles(classification.matches, effective);
        return { t, sim };
      });

      // Eligibility gate: any therapist with zero semantic overlap is out.
      const kept = scored.filter(({ sim }) => sim > 0);
      filteredTherapistCount = scored.length - kept.length;
      kept.forEach(({ sim }) => sims.push(sim));

      therapists = kept
        .map(({ t, sim }) => ({ ...t, score: t.score + Math.round(60 * sim) }))
        .sort((a, b) => b.score - a.score || b.years_experience - a.years_experience);

      avgSim = sims.length ? Number((sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(4)) : 0;
    }

    // Was this a "selected after clarification" call?
    const clarificationSelected = !!data.problemSlug && !!rawQuery;

    await logSemanticSearch({
      raw_query: rawQuery || null,
      normalized_query: normalized || null,
      cache_hit: cacheHit,
      classifier_source: classification?.source ?? null,
      matches: classification?.matches ?? [],
      clarification_shown: false,
      clarification_selected: clarificationSelected,
      selected_problem_slug: data.problemSlug ?? null,
      result_count: therapists.length,
      pre_rank_candidates_count: preRankCandidatesCount,
      filtered_therapist_count: filteredTherapistCount,
      final_results_count: therapists.length,
      avg_semantic_similarity_score: avgSim,
    });

    return {
      mode: "results",
      therapists,
      classification,
      normalizedQuery: normalized || null,
    };
  });

/**
 * Fire-and-forget log of a semantic-search invocation. Failures are swallowed
 * so observability never blocks the user-facing search flow.
 */
async function logSemanticSearch(row: {
  raw_query: string | null;
  normalized_query: string | null;
  cache_hit: boolean;
  classifier_source: string | null;
  matches: unknown;
  clarification_shown: boolean;
  clarification_selected: boolean;
  selected_problem_slug: string | null;
  result_count: number;
  pre_rank_candidates_count?: number;
  filtered_therapist_count?: number;
  final_results_count?: number;
  avg_semantic_similarity_score?: number | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Table was added in this phase; types regenerate after migration.
    await (supabaseAdmin as unknown as {
      from: (t: string) => { insert: (r: unknown) => Promise<unknown> };
    })
      .from("semantic_search_logs")
      .insert(row);
  } catch {
    // ignore — observability is best-effort
  }
}

const CtaSchema = z.object({
  therapistId: z.string().uuid(),
  sourceProblemId: z.string().uuid().nullable().optional(),
  ctaId: z.string().trim().min(1).max(64).optional(),
});

/**
 * Records a CTA click. Billable at most once per (therapist, session) per 24h.
 * Returns the therapist phone so the client can initiate the call.
 */
export const recordCtaClick = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CtaSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const headers = req?.headers;
    const userAgent = headers?.get("user-agent") ?? null;
    const ip = headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || headers?.get("x-real-ip") || "0.0.0.0";
    const salt = process.env.SUPABASE_PROJECT_ID ?? "salt";
    const ipHash = createHash("sha256").update(`${ip}:${salt}`).digest("hex");

    // Session id from cookie, or generate one
    const cookieHeader = headers?.get("cookie") ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)mt_sid=([^;]+)/);
    const sessionId = match?.[1] ?? randomUUID();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load phone first (also validates therapist exists)
    const { data: therapist, error: tErr } = await supabaseAdmin
      .from("therapists")
      .select("phone")
      .eq("id", data.therapistId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!therapist) throw new Error("Therapist not found");

    // Atomic, DB-enforced idempotency: UNIQUE(session_id, therapist_id, cta_id)
    // guarantees only the first call ever returns billable=true.
    const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc("record_cta_click", {
      _therapist_id: data.therapistId,
      _session_id: sessionId,
      _cta_id: data.ctaId ?? "primary",
      _source_problem_id: data.sourceProblemId ?? undefined,
      _ip_hash: ipHash ?? undefined,
      _user_agent: userAgent ?? undefined,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    return {
      phone: therapist.phone,
      sessionId,
      billable: !!row?.billable,
      alreadyExists: !!row?.already_exists,
    };
  });
