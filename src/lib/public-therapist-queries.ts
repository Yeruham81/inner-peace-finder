/**
 * Public therapist reads, expressed as plain functions over a Supabase-like
 * client so they can be exercised in tests without a database.
 *
 * EVERY query here routes through `applyEligibility()` — the single
 * application-level definition of "publicly listable".
 */

import { applyEligibility } from "./search-eligibility";
import {
  PUBLIC_THERAPIST_SELECT,
  type PublicContactMethod,
  type PublicTherapistProfile,
} from "./public-therapist-profile";
import { regionSlugForStoredValue } from "./locality-options";
import { parseStoredProfile } from "./therapist-semantic-profile";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PublicReadClient = { from: (table: string) => any };

const PUBLIC_CONTACT_METHODS = new Set<PublicContactMethod>(["whatsapp", "email", "phone"]);

function isPublicContactMethod(value: unknown): value is PublicContactMethod {
  return typeof value === "string" && PUBLIC_CONTACT_METHODS.has(value as PublicContactMethod);
}

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
    pops,
    langs,
    professions,
    modalities,
    formats,
    locations,
    memberships,
    arrangements,
    semanticSource,
    problemCatalog,
  ] = await Promise.all([
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
    // Read the raw semantic profile only inside the trusted server function.
    // The explicit public projection below returns mapped problem fields only.
    sb.from("therapists").select("semantic_profile").eq("id", t.id).maybeSingle(),
    sb.from("problems").select("id, slug, name:name_he, parent_id").eq("is_active", true),
  ]);

  // Never turn a failed public relation read into an empty section. `data ??
  // []` is valid only after Supabase confirmed that the query itself
  // succeeded; otherwise the route must reach its error boundary.
  for (const [relation, result] of [
    ["therapist_populations", pops],
    ["therapist_languages", langs],
    ["therapist_professions", professions],
    ["therapist_modalities", modalities],
    ["therapist_therapy_formats", formats],
    ["therapist_locations", locations],
    ["therapist_professional_memberships", memberships],
    ["therapist_service_arrangements", arrangements],
    ["therapists.semantic_profile", semanticSource],
    ["problems", problemCatalog],
  ] as const) {
    if (result.error) throw new Error(`${relation}: ${result.error.message}`);
  }

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

  const contactMethods = Array.isArray(t.contact_methods)
    ? [...new Set(t.contact_methods.filter(isPublicContactMethod))].slice(0, 3)
    : [];
  const preferredContactMethod =
    isPublicContactMethod(t.preferred_contact_method) && contactMethods.includes(t.preferred_contact_method)
      ? t.preferred_contact_method
      : (contactMethods[0] ?? null);

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
    years_experience: t.years_experience ?? null,
    city: t.city ?? null,
    image_url: t.image_url ?? null,
    gender: t.gender === "male" || t.gender === "female" ? t.gender : null,
    // Database triggers keep this projection synchronized with manual
    // verification and verified credentials for every public surface.
    verified: !!t.verified,
    lgbtq_affirming: !!t.lgbtq_affirming,
    offers_free_intro: !!t.offers_free_intro,
    free_intro_types: t.free_intro_types ?? [],
    free_intro_duration_minutes: t.free_intro_duration_minutes ?? null,
    contact_methods: contactMethods,
    preferred_contact_method: preferredContactMethod,
    profile_origin: t.profile_origin === "admin_public_info" ? "admin_public_info" : "self_created",
    profile_claimed: !!t.profile_claimed,
    professions: mappedProfessions,
    modalities: mappedModalities,
    therapy_formats: ((formats?.data ?? []) as any[]).map((r) => r.therapy_formats).filter(Boolean),
    locations: (locations?.data ?? []) as any[],
    professional_memberships: (memberships?.data ?? []) as any[],
    service_arrangements: (arrangements?.data ?? []) as any[],
    // Use the same canonical semantic profile that powers search-result cards.
    // An empty semantic profile intentionally produces no treatment domains;
    // the legacy therapist_problems relation is not a second source of truth.
    problems: extractedProblems,
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

  // A failed catalog read is not an empty catalog. Propagate the failure so
  // the route/query error boundary can show an explicit load error instead of
  // silently hiding filter options from the user.
  for (const [catalog, result] of [
    ["population_groups", populations],
    ["languages", languages],
    ["professions", professions],
    ["treatment_modalities", modalities],
    ["therapy_formats", therapyFormats],
  ] as const) {
    if (result.error) throw new Error(`${catalog}: ${result.error.message}`);
  }

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
