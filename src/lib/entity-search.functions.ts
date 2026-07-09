import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Entity Search layer — matches free-text against therapist identities
 * (name, professional title, city). Runs in parallel to the SemanticEngine;
 * results are surfaced separately and NOT merged into semantic ranking.
 *
 * A later phase will fuse `entity_score` with semantic ranking. For now the
 * caller consumes this list as a discrete "matches by name" strip.
 */
export type TherapistEntityMatch = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string;
  city: string | null;
  image_url: string | null;
  verified: boolean;
  entity_score: number;
  match_field: "full_name" | "professional_title" | "city";
};

const Schema = z.object({
  query: z.string().trim().min(1).max(80),
  limit: z.number().int().min(1).max(20).optional(),
});

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export const searchTherapistEntities = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }): Promise<TherapistEntityMatch[]> => {
    const sb = publicClient();
    const q = data.query.trim();
    if (q.length < 2) return [];
    const limit = data.limit ?? 6;
    const like = `%${escapeIlike(q)}%`;

    const { data: rows, error } = await sb
      .from("therapists")
      .select("id, slug, full_name, professional_title, city, image_url, verified")
      .or(`full_name.ilike.${like},professional_title.ilike.${like},city.ilike.${like}`)
      .limit(limit * 2);
    if (error || !rows) return [];

    const ql = q.toLowerCase();
    const scored: TherapistEntityMatch[] = rows.map((r) => {
      const name = (r.full_name ?? "").toLowerCase();
      const title = (r.professional_title ?? "").toLowerCase();
      const city = (r.city ?? "").toLowerCase();
      let score = 0;
      let field: TherapistEntityMatch["match_field"] = "full_name";
      if (name === ql) { score = 1.0; field = "full_name"; }
      else if (name.startsWith(ql)) { score = 0.9; field = "full_name"; }
      else if (name.includes(ql)) { score = 0.75; field = "full_name"; }
      else if (title.includes(ql)) { score = 0.5; field = "professional_title"; }
      else if (city.includes(ql)) { score = 0.35; field = "city"; }
      return {
        id: r.id,
        slug: r.slug,
        full_name: r.full_name,
        professional_title: r.professional_title,
        city: r.city,
        image_url: r.image_url,
        verified: !!r.verified,
        entity_score: score,
        match_field: field,
      };
    });

    return scored
      .filter((r) => r.entity_score > 0)
      .sort((a, b) => b.entity_score - a.entity_score)
      .slice(0, limit);
  });