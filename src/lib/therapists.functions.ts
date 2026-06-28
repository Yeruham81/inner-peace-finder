import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { normalizeHebrew } from "./hebrew-normalizer";
import { classifyQuery, type ClassificationResult } from "./semantic-classifier";
import {
  buildClarificationPrompt,
  needsClarification,
  type ClarificationPrompt,
} from "./search-clarification";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export type ScoredTherapist = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string;
  short_intro: string | null;
  years_experience: number;
  city: string;
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
    const sb = publicClient();
    const q = (data.query ?? "").trim();

    // 1) Intent / alias / problem-name → matching problem IDs
    const matchedProblemIds = new Set<string>();
    const intentProblemIds = new Set<string>();
    let parentAnxietyId: string | null = null;

    const { data: anxietyParent } = await sb.from("problems").select("id").eq("slug", "anxiety").maybeSingle();
    parentAnxietyId = anxietyParent?.id ?? null;

    if (q.length >= 2) {
      const like = `%${q}%`;
      const [intents, aliases, problems] = await Promise.all([
        sb.from("problem_intents").select("problem_id").ilike("intent_text", like),
        sb.from("problem_aliases").select("problem_id").ilike("alias", like),
        sb.from("problems").select("id").ilike("name", like),
      ]);
      intents.data?.forEach((r) => intentProblemIds.add(r.problem_id));
      aliases.data?.forEach((r) => matchedProblemIds.add(r.problem_id));
      problems.data?.forEach((r) => matchedProblemIds.add(r.id));
      intentProblemIds.forEach((id) => matchedProblemIds.add(id));
    }

    // Structured problem filter
    let filterProblemId: string | null = null;
    if (data.problemSlug) {
      const { data: p } = await sb.from("problems").select("id").eq("slug", data.problemSlug).maybeSingle();
      filterProblemId = p?.id ?? null;
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

    // 2) Candidate therapist ids
    let candidateIds: Set<string> | null = null;
    if (matchedProblemIds.size > 0) {
      const { data: tps } = await sb
        .from("therapist_problems")
        .select("therapist_id")
        .in("problem_id", Array.from(matchedProblemIds));
      candidateIds = new Set(tps?.map((r) => r.therapist_id) ?? []);
    }
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
    let tq = sb
      .from("therapists")
      .select("id, slug, full_name, professional_title, short_intro, years_experience, city, image_url, verified");
    if (candidateIds) {
      if (candidateIds.size === 0) return [] as ScoredTherapist[];
      tq = tq.in("id", Array.from(candidateIds));
    }
    if (data.city) tq = tq.eq("city", data.city);
    const { data: therapists, error } = await tq;
    if (error) throw new Error(error.message);
    if (!therapists || therapists.length === 0) return [] as ScoredTherapist[];

    const ids = therapists.map((t) => t.id);

    // 4) Load relations for scoring + display
    const [{ data: tpRows }, { data: tpopRows }, { data: tlangRows }] = await Promise.all([
      sb
        .from("therapist_problems")
        .select("therapist_id, problem_id, problems(slug, parent_id)")
        .in("therapist_id", ids),
      sb.from("therapist_populations").select("therapist_id, population_groups(slug, name)").in("therapist_id", ids),
      sb.from("therapist_languages").select("therapist_id, languages(code, name)").in("therapist_id", ids),
    ]);

    type ProblemJoin = { slug: string; parent_id: string | null } | null;
    const tpByT = new Map<string, { problem_id: string; problem: ProblemJoin }[]>();
    tpRows?.forEach((r) => {
      const arr = tpByT.get(r.therapist_id) ?? [];
      arr.push({ problem_id: r.problem_id, problem: r.problems as ProblemJoin });
      tpByT.set(r.therapist_id, arr);
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
    const results: ScoredTherapist[] = therapists.map((t) => {
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
  const sb = publicClient();
  const { data, error } = await sb.from("problems").select("id, name, slug, description, parent_id").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listFilterOptions = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [cities, populations, languages] = await Promise.all([
    sb.from("therapists").select("city"),
    sb.from("population_groups").select("slug, name").order("sort_order"),
    sb.from("languages").select("code, name").order("name"),
  ]);
  const citySet = new Set<string>();
  cities.data?.forEach((r) => citySet.add(r.city));
  return {
    cities: Array.from(citySet).sort((a, b) => a.localeCompare(b, "he")),
    populations: populations.data ?? [],
    languages: languages.data ?? [],
  };
});

export const getProblemBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: problem } = await sb
      .from("problems")
      .select("id, name, slug, description, parent_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!problem) return null;
    const { data: children } = await sb
      .from("problems")
      .select("id, name, slug, description")
      .eq("parent_id", problem.id)
      .order("name");
    return { ...problem, children: children ?? [] };
  });

export const getTherapistBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: t } = await sb.from("therapists").select("*").eq("slug", data.slug).maybeSingle();
    if (!t) return null;
    const [{ data: tps }, { data: pops }, { data: langs }] = await Promise.all([
      sb.from("therapist_problems").select("problems(id, name, slug, parent_id)").eq("therapist_id", t.id),
      sb.from("therapist_populations").select("population_groups(slug, name)").eq("therapist_id", t.id),
      sb.from("therapist_languages").select("languages(code, name)").eq("therapist_id", t.id),
    ]);
    return {
      ...t,
      problems: (tps ?? []).map((r: any) => r.problems).filter(Boolean) as {
        id: string;
        name: string;
        slug: string;
        parent_id: string | null;
      }[],
      populations: (pops ?? []).map((r: any) => r.population_groups).filter(Boolean) as {
        slug: string;
        name: string;
      }[],
      languages: (langs ?? []).map((r: any) => r.languages).filter(Boolean) as { code: string; name: string }[],
    };
  });

export const listAllTherapistSlugs = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data } = await sb.from("therapists").select("slug");
  return data?.map((r) => r.slug) ?? [];
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
    const sb = publicClient();
    const rawQuery = (data.query ?? "").trim();
    const normalized = rawQuery ? normalizeHebrew(rawQuery) : "";

    let classification: ClassificationResult | null = null;

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
      } else {
        classification = await classifyQuery(normalized, sb);
        // Best-effort cache write; never block search on a cache miss.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("query_classifications")
            .insert({
              normalized_query: normalized,
              result: classification as unknown as Record<string, unknown>,
              source: classification.source ?? "mock",
            });
        } catch {
          // ignore — cache is an optimization, not a requirement
        }
      }

      if (classification && needsClarification(classification.matches)) {
        const clarification = await buildClarificationPrompt(classification.matches, sb);
        if (clarification.options.length >= 2) {
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
    const therapists = await searchTherapists({ data });
    return {
      mode: "results",
      therapists,
      classification,
      normalizedQuery: normalized || null,
    };
  });

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
