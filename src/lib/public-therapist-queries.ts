/**
 * Public therapist reads, expressed as plain functions over a Supabase-like
 * client so they can be exercised in tests without a database.
 *
 * EVERY query here routes through `applyEligibility()` — the single
 * application-level definition of "publicly listable".
 */

import { applyEligibility } from "./search-eligibility";
import { PUBLIC_THERAPIST_SELECT, type PublicTherapistProfile } from "./public-therapist-profile";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PublicReadClient = { from: (table: string) => any };

function unwrap<T>(res: { data: T | null; error: unknown }): T | null {
  if (res.error) throw res.error;
  return res.data;
}

/** Public profile by slug, or null when the profile is not publicly eligible. */
export async function fetchPublicTherapistBySlug(
  sb: PublicReadClient,
  slug: string,
): Promise<PublicTherapistProfile | null> {
  const res = await applyEligibility(
    sb.from("therapists").select(PUBLIC_THERAPIST_SELECT).eq("slug", slug),
  ).maybeSingle();
  const t = unwrap(res) as Record<string, any> | null;
  if (!t) return null;

  const [tps, pops, langs, formats, locations, memberships, arrangements] = await Promise.all([
    sb.from("therapist_problems").select("problems(id, name, slug, parent_id)").eq("therapist_id", t.id),
    sb.from("therapist_populations").select("population_groups(slug, name)").eq("therapist_id", t.id),
    sb.from("therapist_languages").select("languages(code, name)").eq("therapist_id", t.id),
    sb.from("therapist_therapy_formats").select("therapy_formats(slug, name:name_he)").eq("therapist_id", t.id),
    sb
      .from("therapist_locations")
      .select("city, accessibility_status, accessibility_features, accessibility_note")
      .eq("therapist_id", t.id)
      .eq("location_type", "clinic")
      .eq("is_active", true),
    sb
      .from("therapist_professional_memberships")
      .select("organization_name, member_since")
      .eq("therapist_id", t.id)
      .order("sort_order"),
    sb
      .from("therapist_service_arrangements")
      .select("organization_name, note")
      .eq("therapist_id", t.id)
      .order("sort_order"),
  ]);

  // Explicit projection — never spread the database row.
  return {
    id: t.id,
    slug: t.slug,
    full_name: t.full_name,
    professional_title: t.professional_title ?? null,
    short_intro: t.short_intro ?? null,
    full_description: t.full_description ?? null,
    years_experience: t.years_experience ?? 0,
    city: t.city ?? null,
    image_url: t.image_url ?? null,
    verified: !!t.verified,
    lgbtq_affirming: !!t.lgbtq_affirming,
    offers_free_intro: !!t.offers_free_intro,
    free_intro_types: t.free_intro_types ?? [],
    free_intro_duration_minutes: t.free_intro_duration_minutes ?? null,
    therapy_formats: ((formats?.data ?? []) as any[]).map((r) => r.therapy_formats).filter(Boolean),
    locations: (locations?.data ?? []) as any[],
    professional_memberships: (memberships?.data ?? []) as any[],
    service_arrangements: (arrangements?.data ?? []) as any[],
    problems: ((tps?.data ?? []) as any[]).map((r) => r.problems).filter(Boolean),
    populations: ((pops?.data ?? []) as any[]).map((r) => r.population_groups).filter(Boolean),
    languages: ((langs?.data ?? []) as any[]).map((r) => r.languages).filter(Boolean),
  };
}

/** Sitemap slugs — eligible profiles only. */
export async function listEligibleTherapistSlugs(sb: PublicReadClient): Promise<string[]> {
  const rows = unwrap(await applyEligibility(sb.from("therapists").select("slug"))) as Array<{
    slug: string;
  }> | null;
  return (rows ?? []).map((r) => r.slug).filter(Boolean);
}

/** Filter options. Cities are derived from eligible profiles only. */
export async function listEligibleFilterOptions(sb: PublicReadClient) {
  const [cities, populations, languages] = await Promise.all([
    applyEligibility(sb.from("therapists").select("city")),
    sb.from("population_groups").select("slug, name").order("sort_order"),
    sb.from("languages").select("code, name").order("name"),
  ]);
  const citySet = new Set<string>();
  ((unwrap(cities) ?? []) as Array<{ city: string | null }>).forEach((r) => {
    if (r.city) citySet.add(r.city);
  });
  return {
    cities: Array.from(citySet).sort((a, b) => a.localeCompare(b, "he")),
    populations: (populations?.data ?? []) as Array<{ slug: string; name: string }>,
    languages: (languages?.data ?? []) as Array<{ code: string; name: string }>,
  };
}
