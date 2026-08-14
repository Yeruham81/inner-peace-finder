/**
 * Public therapist reads, expressed as plain functions over a Supabase-like
 * client so they can be exercised in tests without a database.
 *
 * EVERY query here routes through `applyEligibility()` — the single
 * application-level definition of "publicly listable".
 */

import { applyEligibility } from "./search-eligibility";
import { PUBLIC_THERAPIST_SELECT, type PublicTherapistProfile } from "./public-therapist-profile";
import { regionSlugForStoredValue } from "./locality-options";
import { parseStoredProfile } from "./therapist-semantic-profile";

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

  const [
    tps,
    pops,
    langs,
    professions,
    modalities,
    formats,
    locations,
    memberships,
    arrangements,
    verifiedCredentials,
    semanticSource,
    problemCatalog,
  ] = await Promise.all([
    sb.from("therapist_problems").select("problems(id, name, slug, parent_id)").eq("therapist_id", t.id),
    sb.from("therapist_populations").select("population_groups(slug, name)").eq("therapist_id", t.id),
    sb.from("therapist_languages").select("languages(code, name)").eq("therapist_id", t.id),
    sb
      .from("therapist_professions")
      .select("is_primary, professions!inner(slug, name:name_he, sort_order, is_active)")
      .eq("therapist_id", t.id)
      .eq("professions.is_active", true),
    sb
      .from("therapist_modalities")
      .select("treatment_modalities!inner(slug, name:name_he, sort_order, is_active)")
      .eq("therapist_id", t.id)
      .eq("treatment_modalities.is_active", true),
    sb.from("therapist_therapy_formats").select("therapy_formats(slug, name:name_he)").eq("therapist_id", t.id),
    sb
      .from("therapist_locations")
      .select(
        "location_type, city, region, is_primary, accessibility_status, accessibility_features, accessibility_note",
      )
      .eq("therapist_id", t.id)
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
    sb
      .from("therapist_credentials")
      .select("id")
      .eq("therapist_id", t.id)
      .eq("verification_status", "verified")
      .limit(1),
    // Read the raw semantic profile only inside the trusted server function.
    // The explicit public projection below returns mapped problem fields only.
    sb.from("therapists").select("semantic_profile").eq("id", t.id).maybeSingle(),
    sb.from("problems").select("id, slug, name:name_he, parent_id").eq("is_active", true),
  ]);

  type MappedProfession = { slug: string; name: string; is_primary: boolean; sort_order: number };
  const mappedProfessions = ((professions?.data ?? []) as any[])
    .map((row): MappedProfession | null =>
      row.professions
        ? {
            slug: row.professions.slug,
            name: row.professions.name,
            is_primary: !!row.is_primary,
            sort_order: row.professions.sort_order ?? 0,
          }
        : null,
    )
    .filter((row): row is MappedProfession => row !== null)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .map(({ slug, name, is_primary }) => ({ slug, name, is_primary }));

  const mappedModalities = ((modalities?.data ?? []) as any[])
    .map((row) => row.treatment_modalities)
    .filter(Boolean)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(({ slug, name }) => ({ slug, name }));

  const catalogBySlug = new Map(
    ((problemCatalog?.data ?? []) as any[]).map((problem) => [problem.slug, problem] as const),
  );
  const extractedProblems = parseStoredProfile(semanticSource?.data?.semantic_profile)
    .map((entry) => catalogBySlug.get(entry.slug))
    .filter(Boolean)
    .map((problem) => ({
      id: String(problem.id),
      name: problem.name,
      slug: problem.slug,
      parent_id: problem.parent_id === null ? null : String(problem.parent_id),
    }));
  const legacyProblems = ((tps?.data ?? []) as any[]).map((row) => row.problems).filter(Boolean);

  // Explicit projection — never spread the database row.
  return {
    id: t.id,
    slug: t.slug,
    full_name: t.full_name,
    professional_title: t.professional_title ?? null,
    short_intro: t.short_intro ?? null,
    full_description: t.full_description ?? null,
    education_training: t.education_training ?? null,
    professional_experience: t.professional_experience ?? null,
    years_experience: t.years_experience ?? 0,
    city: t.city ?? null,
    image_url: t.image_url ?? null,
    // Preserve the existing profile-level verification flag while also
    // granting the public badge when at least one credential was verified.
    verified: !!t.verified || (verifiedCredentials?.data?.length ?? 0) > 0,
    lgbtq_affirming: !!t.lgbtq_affirming,
    offers_free_intro: !!t.offers_free_intro,
    free_intro_types: t.free_intro_types ?? [],
    free_intro_duration_minutes: t.free_intro_duration_minutes ?? null,
    professions: mappedProfessions,
    modalities: mappedModalities,
    therapy_formats: ((formats?.data ?? []) as any[]).map((r) => r.therapy_formats).filter(Boolean),
    locations: (locations?.data ?? []) as any[],
    professional_memberships: (memberships?.data ?? []) as any[],
    service_arrangements: (arrangements?.data ?? []) as any[],
    // Use the same extracted domains that power search-result cards. Keep the
    // legacy relation only as a fallback for profiles not backfilled yet.
    problems: extractedProblems.length > 0 ? extractedProblems : legacyProblems,
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

async function listEligibleClinicCities(
  sb: PublicReadClient,
): Promise<{ cities: string[]; cityRegions: Record<string, string[]> }> {
  const eligibleTherapists = unwrap(await applyEligibility(sb.from("therapists").select("id"))) as Array<{
    id: string;
  }> | null;
  const eligibleIds = (eligibleTherapists ?? []).map((row) => row.id);
  if (eligibleIds.length === 0) return { cities: [], cityRegions: {} };

  const locations = unwrap(
    await sb
      .from("therapist_locations")
      .select("city, region")
      .in("therapist_id", eligibleIds)
      .eq("location_type", "clinic")
      .eq("is_active", true),
  ) as Array<{ city: string | null; region: string | null }> | null;

  const citySet = new Set<string>();
  const regionSets = new Map<string, Set<string>>();
  for (const location of locations ?? []) {
    const city = location.city?.trim();
    if (!city) continue;
    citySet.add(city);
    const regionSlug = regionSlugForStoredValue(location.region);
    if (regionSlug) {
      const regions = regionSets.get(city) ?? new Set<string>();
      regions.add(regionSlug);
      regionSets.set(city, regions);
    }
  }
  return {
    cities: Array.from(citySet).sort((a, b) => a.localeCompare(b, "he")),
    cityRegions: Object.fromEntries([...regionSets].map(([city, regions]) => [city, [...regions]])),
  };
}

/** Filter options. Cities come from every active clinic of eligible profiles. */
export async function listEligibleFilterOptions(sb: PublicReadClient) {
  const [clinicCities, populations, languages, professions, modalities, therapyFormats] = await Promise.all([
    listEligibleClinicCities(sb),
    sb.from("population_groups").select("slug, name").order("sort_order"),
    sb.from("languages").select("code, name").order("name"),
    sb.from("professions").select("slug, name:name_he").eq("is_active", true).order("sort_order"),
    sb.from("treatment_modalities").select("slug, name:name_he").eq("is_active", true).order("sort_order"),
    sb.from("therapy_formats").select("slug, name:name_he").eq("is_active", true).order("sort_order"),
  ]);
  return {
    cities: clinicCities.cities,
    cityRegions: clinicCities.cityRegions,
    populations: (populations?.data ?? []) as Array<{ slug: string; name: string }>,
    languages: (languages?.data ?? []) as Array<{ code: string; name: string }>,
    professions: (professions?.data ?? []) as Array<{ slug: string; name: string }>,
    modalities: (modalities?.data ?? []) as Array<{ slug: string; name: string }>,
    therapyFormats: (therapyFormats?.data ?? []) as Array<{ slug: string; name: string }>,
  };
}
