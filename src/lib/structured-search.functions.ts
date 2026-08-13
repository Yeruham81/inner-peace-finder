import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { applyEligibility } from "./search-eligibility";

/**
 * Throw on Supabase read failure so a failed public query never masquerades
 * as an empty result set. Callers pass the raw supabase-js response tuple.
 */
function unwrap<T>(res: { data: T | null; error: unknown }): T | null {
  if (res.error) throw res.error;
  return res.data;
}

/**
 * Structured Search — the platform's single source of truth for searching
 * structured entities. Replaces the previous "Entity Search" layer.
 *
 * Runs in parallel to the SemanticEngine; results are surfaced separately and
 * are NOT merged into semantic ranking (a later phase, P6, will fuse them).
 *
 * Supported entity types in this phase:
 *  - "therapist"  (structured therapist identities)
 *  - "profession" (public.professions ⨝ public.therapist_professions)
 *  - "modality"   (public.treatment_modalities ⨝ public.therapist_modalities)
 *  - "location"   (distinct city from public.therapist_locations)
 *
 * Architecture is prepared for future entity types (clinic, organization,
 * hospital, university, HMO, language, specialty, certification, treatment
 * method, insurance affiliation) without redesign: each type is a
 * self-contained matcher that returns a discriminated union member with a
 * `type` field. Adding a new type = adding a new matcher and extending the
 * union — no core changes required.
 */

async function publicClient() {
  // Public reads run through the server-only trusted client: `anon` has no
  // direct privileges on public.therapists. Eligibility is still applied.
  const { trustedReadClient } = await import("./trusted-read-client.server");
  return trustedReadClient();
}

export type StructuredEntityType = "therapist" | "profession" | "modality" | "location";

/**
 * Therapist result. `professional_title` is retained as descriptive display
 * text ONLY — Structured Search no longer treats it as an authoritative
 * profession source. Profession matching goes through the structured
 * `professions` + `therapist_professions` tables.
 */
export type TherapistStructuredResult = {
  type: "therapist";
  id: string;
  slug: string;
  full_name: string;
  professional_title: string | null;
  city: string | null;
  image_url: string | null;
  verified: boolean;
  score: number;
  match_field: "full_name" | "profession" | "modality" | "location";
};

export type ProfessionStructuredResult = {
  type: "profession";
  id: string;
  slug: string;
  name_he: string;
  name_en: string | null;
  therapist_count: number;
  score: number;
};

export type ModalityStructuredResult = {
  type: "modality";
  id: string;
  slug: string;
  name_he: string;
  name_en: string | null;
  therapist_count: number;
  score: number;
};

export type LocationStructuredResult = {
  type: "location";
  city: string;
  region: string | null;
  therapist_count: number;
  score: number;
};

export type StructuredResult =
  | TherapistStructuredResult
  | ProfessionStructuredResult
  | ModalityStructuredResult
  | LocationStructuredResult;

const Schema = z.object({
  query: z.string().trim().min(1).max(80),
  limit: z.number().int().min(1).max(20).optional(),
  types: z.array(z.enum(["therapist", "profession", "modality", "location"])).optional(),
});

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function scoreText(target: string, ql: string): number {
  const t = target.toLowerCase();
  if (!t) return 0;
  if (t === ql) return 1.0;
  if (t.startsWith(ql)) return 0.9;
  if (t.includes(ql)) return 0.75;
  return 0;
}

/**
 * Unified structured-entity search. Callers may restrict to specific
 * entity types via `types`; default is all supported types.
 */
async function runStructuredSearch(data: z.infer<typeof Schema>): Promise<StructuredResult[]> {
  const sb = await publicClient();
  const q = data.query.trim();
  if (q.length < 2) return [];
  const ql = q.toLowerCase();
  const like = `%${escapeIlike(q)}%`;
  const limit = data.limit ?? 10;
  const types = new Set<StructuredEntityType>(data.types ?? ["therapist", "profession", "modality", "location"]);

  // --- profession lookups (authoritative: professions + therapist_professions) ---
  let professionMatches: { id: string; slug: string; name_he: string; name_en: string | null; score: number }[] = [];
  const therapistIdsByProfession = new Set<string>();
  if (types.has("profession") || types.has("therapist")) {
    const profs = unwrap(
      await sb
        .from("professions")
        .select("id, slug, name_he, name_en")
        .eq("is_active", true)
        .or(`name_he.ilike.${like},name_en.ilike.${like},slug.ilike.${like}`)
        .limit(20),
    );
    professionMatches = (profs ?? []).map((p) => ({
      ...p,
      score: Math.max(scoreText(p.name_he, ql), scoreText(p.name_en ?? "", ql), scoreText(p.slug, ql)),
    }));

    if (professionMatches.length > 0) {
      const ids = professionMatches.map((p) => p.id);
      const joins = unwrap(
        await applyEligibility(
          sb
            .from("therapist_professions")
            .select("therapist_id, profession_id, therapists!inner(id, is_active, profile_status, visibility)")
            .in("profession_id", ids),
          "therapists!inner",
        ),
      );
      for (const row of joins ?? []) therapistIdsByProfession.add(row.therapist_id);
    }
  }

  // --- modality lookups (authoritative: treatment_modalities + therapist_modalities) ---
  let modalityMatches: { id: string; slug: string; name_he: string; name_en: string | null; score: number }[] = [];
  const therapistIdsByModality = new Set<string>();
  if (types.has("modality") || types.has("therapist")) {
    const mods = unwrap(
      await sb
        .from("treatment_modalities")
        .select("id, slug, name_he, name_en")
        .eq("is_active", true)
        .or(`name_he.ilike.${like},name_en.ilike.${like},slug.ilike.${like}`)
        .limit(20),
    );
    modalityMatches = (mods ?? []).map((m) => ({
      ...m,
      score: Math.max(scoreText(m.name_he, ql), scoreText(m.name_en ?? "", ql), scoreText(m.slug, ql)),
    }));

    if (modalityMatches.length > 0) {
      const ids = modalityMatches.map((m) => m.id);
      const joins = unwrap(
        await applyEligibility(
          sb
            .from("therapist_modalities")
            .select("therapist_id, modality_id, therapists!inner(id, is_active, profile_status, visibility)")
            .in("modality_id", ids),
          "therapists!inner",
        ),
      );
      for (const row of joins ?? []) therapistIdsByModality.add(row.therapist_id);
    }
  }

  // --- location lookups (authoritative: therapist_locations) ---
  let locationMatches: { city: string; region: string | null; therapist_count: number; score: number }[] = [];
  const therapistIdsByLocation = new Set<string>();
  if (types.has("location") || types.has("therapist")) {
    const locs = unwrap(
      await applyEligibility(
        sb
          .from("therapist_locations")
          .select("therapist_id, city, region, therapists!inner(id, is_active, profile_status, visibility)")
          .eq("is_active", true),
        "therapists!inner",
      )
        .ilike("city", like)
        .limit(200),
    );
    const cityAgg = new Map<string, { region: string | null; therapists: Set<string> }>();
    for (const row of locs ?? []) {
      if (!row.city) continue;
      therapistIdsByLocation.add(row.therapist_id);
      const key = row.city;
      const cur = cityAgg.get(key) ?? { region: row.region, therapists: new Set<string>() };
      cur.therapists.add(row.therapist_id);
      cityAgg.set(key, cur);
    }
    locationMatches = Array.from(cityAgg.entries()).map(([city, v]) => ({
      city,
      region: v.region,
      therapist_count: v.therapists.size,
      score: scoreText(city, ql),
    }));
  }

  // --- therapist lookups: name match + structured joins ---
  const results: StructuredResult[] = [];
  if (types.has("therapist")) {
    const nameLike = `%${escapeIlike(q)}%`;
    const byName = unwrap(
      await applyEligibility(
        sb.from("therapists").select("id, slug, full_name, professional_title, city, image_url, verified"),
      )
        .ilike("full_name", nameLike)
        .limit(limit * 2),
    );

    const seen = new Map<string, TherapistStructuredResult>();
    for (const r of byName ?? []) {
      const score = scoreText(r.full_name ?? "", ql);
      if (score > 0) {
        seen.set(r.id, {
          type: "therapist",
          id: r.id,
          slug: r.slug,
          full_name: r.full_name,
          professional_title: r.professional_title,
          city: r.city,
          image_url: r.image_url,
          verified: !!r.verified,
          score,
          match_field: "full_name",
        });
      }
    }

    const structuredTherapistIds = new Set<string>([
      ...therapistIdsByProfession,
      ...therapistIdsByModality,
      ...therapistIdsByLocation,
    ]);
    // Remove ones already surfaced by higher-priority name match.
    for (const id of seen.keys()) structuredTherapistIds.delete(id);

    if (structuredTherapistIds.size > 0) {
      const byStructured = unwrap(
        await applyEligibility(
          sb.from("therapists").select("id, slug, full_name, professional_title, city, image_url, verified"),
        ).in("id", Array.from(structuredTherapistIds).slice(0, 40)),
      );
      for (const r of byStructured ?? []) {
        let field: TherapistStructuredResult["match_field"] = "profession";
        let score = 0.5;
        if (therapistIdsByProfession.has(r.id)) {
          field = "profession";
          score = 0.55;
        } else if (therapistIdsByModality.has(r.id)) {
          field = "modality";
          score = 0.5;
        } else if (therapistIdsByLocation.has(r.id)) {
          field = "location";
          score = 0.4;
        }
        seen.set(r.id, {
          type: "therapist",
          id: r.id,
          slug: r.slug,
          full_name: r.full_name,
          professional_title: r.professional_title,
          city: r.city,
          image_url: r.image_url,
          verified: !!r.verified,
          score,
          match_field: field,
        });
      }
    }

    const therapists = Array.from(seen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    results.push(...therapists);
  }

  if (types.has("profession")) {
    // annotate therapist_count for each profession via a single join query
    const withCounts = await Promise.all(
      professionMatches
        .filter((p) => p.score > 0)
        .map(async (p) => {
          const res = await applyEligibility(
            sb
              .from("therapist_professions")
              .select("therapist_id, therapists!inner(id, is_active, profile_status, visibility)", {
                head: true,
                count: "exact",
              })
              .eq("profession_id", p.id),
            "therapists!inner",
          );
          if (res.error) throw res.error;
          const count = res.count;
          const r: ProfessionStructuredResult = {
            type: "profession",
            id: p.id,
            slug: p.slug,
            name_he: p.name_he,
            name_en: p.name_en,
            therapist_count: count ?? 0,
            score: p.score,
          };
          return r;
        }),
    );
    results.push(...withCounts.sort((a, b) => b.score - a.score).slice(0, limit));
  }

  if (types.has("modality")) {
    const withCounts = await Promise.all(
      modalityMatches
        .filter((m) => m.score > 0)
        .map(async (m) => {
          const res = await applyEligibility(
            sb
              .from("therapist_modalities")
              .select("therapist_id, therapists!inner(id, is_active, profile_status, visibility)", {
                head: true,
                count: "exact",
              })
              .eq("modality_id", m.id),
            "therapists!inner",
          );
          if (res.error) throw res.error;
          const count = res.count;
          const r: ModalityStructuredResult = {
            type: "modality",
            id: m.id,
            slug: m.slug,
            name_he: m.name_he,
            name_en: m.name_en,
            therapist_count: count ?? 0,
            score: m.score,
          };
          return r;
        }),
    );
    results.push(...withCounts.sort((a, b) => b.score - a.score).slice(0, limit));
  }

  if (types.has("location")) {
    results.push(
      ...locationMatches
        .filter((l) => l.score > 0)
        .map<LocationStructuredResult>((l) => ({ type: "location", ...l }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit),
    );
  }

  return results;
}

export const searchStructured = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => runStructuredSearch(data));

/**
 * Convenience wrapper returning only therapist results, preserving the
 * ergonomics of the previous entity-search API for call sites that need a
 * typed therapist-only list (e.g. the claim workflow).
 */
export const searchStructuredTherapists = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }): Promise<TherapistStructuredResult[]> => {
    const all = await runStructuredSearch({
      query: data.query,
      limit: data.limit,
      types: ["therapist"],
    });
    return all.filter((r): r is TherapistStructuredResult => r.type === "therapist");
  });
