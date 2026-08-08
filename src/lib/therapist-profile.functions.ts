import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { SemanticEngine } from "./semantic-engine";
import { combineFeedbackDomains, loadFeedbackCatalog } from "./profile-domain-feedback";
import { CANONICAL_LANGUAGE_CODES, orderCanonicalLanguages } from "./language-options";
import {
  PRODUCT_REGIONS,
  loadLocalityOptions,
  normalizeLocalityName,
  type LocalityOption,
  type ProductRegion,
} from "./locality-options";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type ProfileStatus = "draft" | "completed" | "published";
export type Gender = "male" | "female" | "unspecified";

export type ProfileEditorData = {
  id: string | null;
  full_name: string;
  gender: Gender | null;
  professional_title: string | null;
  full_description: string | null;
  short_intro: string | null;
  background: string | null;
  years_experience: number | null;
  email: string | null;
  phone: string | null;
  image_url: string | null;
  slug: string | null;
  profile_status: ProfileStatus;
  is_active: boolean;
  profession_ids: string[];
  modality_ids: string[];
  language_ids: string[];
  population_ids: string[];
  locations: {
    city: string;
    region: ProductRegion | null;
    address: string | null;
    is_primary: boolean;
  }[];
  online_available: boolean;
};

export type EditorOptions = {
  professions: { id: string; name_he: string; slug: string }[];
  modalities: { id: string; name_he: string; slug: string }[];
  languages: { id: string; name: string; code: string }[];
  populations: { id: string; name: string; slug: string }[];
  localities: LocalityOption[];
  locality_options_error: boolean;
};

export type SaveResult = {
  therapist_id: string;
  profile_status: ProfileStatus;
  missing?: string[];
};

/** Read-only semantic feedback for the therapist profile editor.
 *  Deliberately excludes weights / confidence / ranking. */
export type SemanticFeedback = {
  domains: { slug: string; name: string }[];
};

/* ------------------------------------------------------------------ */
/* Constants + helpers                                                */
/* ------------------------------------------------------------------ */

export const DESCRIPTION_MIN = 60;
export const DESCRIPTION_MAX = 4000;

function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `therapist-${suffix}`;
}

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/* ------------------------------------------------------------------ */
/* Schema                                                             */
/* ------------------------------------------------------------------ */

const SaveSchema = z.object({
  full_name: z
    .string({
      required_error: "נא למלא את שדה 'שם מלא' לפני שמירת טיוטה.",
      invalid_type_error: "שם מלא לא תקין.",
    })
    .trim()
    .min(2, "שם מלא חייב להכיל לפחות 2 תווים.")
    .max(120, "שם מלא ארוך מדי (עד 120 תווים)."),
  gender: z.enum(["male", "female", "unspecified"]).nullable().optional(),
  professional_title: z.string().trim().max(160, "כותרת מקצועית ארוכה מדי.").nullable().optional(),
  full_description: z.string().trim().max(DESCRIPTION_MAX, "התיאור המקצועי ארוך מדי.").nullable().optional(),
  short_intro: z.string().trim().max(400, "תיאור קצר ארוך מדי.").nullable().optional(),
  background: z.string().trim().max(4000, "טקסט הרקע ארוך מדי.").nullable().optional(),
  years_experience: z
    .number()
    .int("שנות ניסיון חייבות להיות מספר שלם.")
    .min(0, "שנות ניסיון לא יכולות להיות שליליות.")
    .max(80, "שנות ניסיון לא תקין.")
    .nullable()
    .optional(),
  email: z.string().trim().email("כתובת אימייל לא תקינה.").max(160).nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(40).nullable().optional().or(z.literal("")),
  image_url: z.string().trim().max(500).nullable().optional().or(z.literal("")),
  profession_ids: z.array(z.string().uuid()).max(10).default([]),
  modality_ids: z.array(z.string().uuid()).max(20).default([]),
  language_ids: z.array(z.string().uuid()).max(20).default([]),
  population_ids: z.array(z.string().uuid()).max(20).default([]),
  locations: z
    .array(
      z.object({
        city: z.string().trim().min(1, "יש לבחור יישוב.").max(80, "שם היישוב ארוך מדי."),
        region: z.enum(PRODUCT_REGIONS),
        address: z.string().trim().max(200, "הכתובת ארוכה מדי.").nullable().optional().or(z.literal("")),
      }),
    )
    .max(3, "ניתן להוסיף עד שלושה מיקומים פיזיים.")
    .refine(
      (locations) =>
        new Set(locations.map((location) => normalizeLocalityName(location.city))).size === locations.length,
      "לא ניתן להוסיף את אותו יישוב יותר מפעם אחת.",
    )
    .default([]),
  online_available: z.boolean().default(false),
  publish: z.boolean().default(false),
});

type SaveInput = z.infer<typeof SaveSchema>;

/**
 * Convert ZodError issues into short, user-friendly Hebrew messages so the
 * editor never surfaces raw validation output.
 */
function friendlyZodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return "לא ניתן לשמור — קלט לא תקין.";
  // Prefer explicit Hebrew messages provided on the schema.
  if (first.message && !/^String must|^Invalid|^Required$/i.test(first.message)) {
    return first.message;
  }
  const path = String(first.path[0] ?? "");
  switch (path) {
    case "full_name":
      return "נא למלא את שדה 'שם מלא' לפני שמירת טיוטה.";
    case "email":
      return "כתובת אימייל לא תקינה.";
    default:
      return "לא ניתן לשמור — יש שדה עם ערך לא תקין.";
  }
}

/* ------------------------------------------------------------------ */
/* Owner account resolution                                           */
/* ------------------------------------------------------------------ */

async function resolveAccount(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("therapist_accounts")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase
    .from("therapist_accounts")
    .insert({ auth_user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

/* ------------------------------------------------------------------ */
/* Public options (available to editor without auth restrictions)     */
/* ------------------------------------------------------------------ */

export const getEditorOptions = createServerFn({ method: "GET" }).handler(async (): Promise<EditorOptions> => {
  const sb = publicClient();
  const localitiesPromise = loadLocalityOptions()
    .then((items) => ({ items, error: false }))
    .catch(() => ({ items: [] as LocalityOption[], error: true }));

  const [profs, mods, langs, pops, localityResult] = await Promise.all([
    sb.from("professions").select("id, name_he, slug").eq("is_active", true).order("sort_order"),
    sb.from("treatment_modalities").select("id, name_he, slug").eq("is_active", true).order("sort_order"),
    sb
      .from("languages")
      .select("id, name, code")
      .in("code", [...CANONICAL_LANGUAGE_CODES]),
    sb.from("population_groups").select("id, name, slug").order("sort_order"),
    localitiesPromise,
  ]);
  return {
    professions: profs.data ?? [],
    modalities: mods.data ?? [],
    languages: orderCanonicalLanguages(langs.data ?? []),
    populations: pops.data ?? [],
    localities: localityResult.items,
    locality_options_error: localityResult.error,
  };
});

/* ------------------------------------------------------------------ */
/* Get my profile                                                     */
/* ------------------------------------------------------------------ */

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileEditorData | null> => {
    const { supabase, userId } = context;
    const accountId = await resolveAccount(supabase, userId);
    const { data: t } = await supabase.from("therapists").select("*").eq("owner_account_id", accountId).maybeSingle();
    if (!t) return null;

    const [profs, mods, langs, pops, locs] = await Promise.all([
      supabase.from("therapist_professions").select("profession_id").eq("therapist_id", t.id),
      supabase.from("therapist_modalities").select("modality_id").eq("therapist_id", t.id),
      supabase.from("therapist_languages").select("language_id").eq("therapist_id", t.id),
      supabase.from("therapist_populations").select("population_id").eq("therapist_id", t.id),
      supabase.from("therapist_locations").select("*").eq("therapist_id", t.id).eq("is_active", true),
    ]);

    const physicalLocations = (locs.data ?? [])
      .filter((location) => location.location_type === "clinic")
      .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
    const online = (locs.data ?? []).some((l) => l.location_type === "online");

    return {
      id: t.id,
      full_name: t.full_name,
      gender: (t.gender as Gender | null) ?? null,
      professional_title: t.professional_title,
      full_description: t.full_description,
      short_intro: t.short_intro,
      background: (t as { background?: string | null }).background ?? null,
      years_experience: t.years_experience ?? null,
      email: (t as { email?: string | null }).email ?? null,
      phone: t.phone,
      image_url: t.image_url,
      slug: t.slug,
      profile_status: (t as { profile_status: ProfileStatus }).profile_status,
      is_active: t.is_active,
      profession_ids: (profs.data ?? []).map((r) => r.profession_id),
      modality_ids: (mods.data ?? []).map((r) => r.modality_id),
      language_ids: (langs.data ?? []).map((r) => r.language_id),
      population_ids: (pops.data ?? []).map((r) => r.population_id),
      locations: physicalLocations.map((location) => ({
        city: location.city ?? "",
        region: PRODUCT_REGIONS.includes(location.region as ProductRegion) ? (location.region as ProductRegion) : null,
        address: location.address ?? null,
        is_primary: Boolean(location.is_primary),
      })),
      online_available: online,
    };
  });

/* ------------------------------------------------------------------ */
/* Validation for publish                                             */
/* ------------------------------------------------------------------ */

function validateForPublish(input: SaveInput): string[] {
  const missing: string[] = [];
  if (!input.full_name || input.full_name.trim().length < 2) missing.push("שם מלא");
  if (!input.gender) missing.push("מין");
  if (!input.professional_title || input.professional_title.trim().length === 0) missing.push("כותרת מקצועית");
  if (!input.profession_ids || input.profession_ids.length === 0) missing.push("מקצועות");
  if (input.years_experience === null || input.years_experience === undefined) missing.push("שנות ניסיון");
  if (!input.full_description || input.full_description.trim().length < DESCRIPTION_MIN) {
    missing.push("תיאור מקצועי");
  }
  if (!input.language_ids || input.language_ids.length === 0) missing.push("שפות טיפול");
  if (!input.population_ids || input.population_ids.length === 0) missing.push("אוכלוסיות טיפול");
  if (!input.email) missing.push("כתובת אימייל");
  if (!input.phone) missing.push("מספר טלפון");
  const hasPhysicalLocation = input.locations.length > 0;
  if (!hasPhysicalLocation && !input.online_available) missing.push("מיקום פיזי או זמינות אונליין");
  return missing;
}

async function resolvePhysicalLocations(
  locations: SaveInput["locations"],
): Promise<Array<{ city: string; region: ProductRegion; address: string | null }>> {
  if (locations.length === 0) return [];

  let catalog: LocalityOption[] | null = null;
  try {
    catalog = await loadLocalityOptions();
  } catch {
    // The editor only offers official options. If data.gov.il is temporarily
    // unavailable during save, keep the form usable and fall back to the
    // already-derived, enum-validated region sent by the editor.
  }

  const byName = catalog ? new Map(catalog.map((locality) => [normalizeLocalityName(locality.name), locality])) : null;

  return locations.map((location) => {
    const normalizedCity = normalizeLocalityName(location.city);
    const canonical = byName?.get(normalizedCity);
    if (byName && !canonical) {
      throw new Error(`היישוב "${location.city}" אינו מופיע ברשימת היישובים הרשמית.`);
    }

    return {
      city: canonical?.name ?? normalizedCity,
      region: canonical?.region ?? location.region,
      address: location.address?.trim() || null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Save (draft or publish)                                            */
/* ------------------------------------------------------------------ */

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = SaveSchema.safeParse(input);
    if (!parsed.success) throw new Error(friendlyZodMessage(parsed.error));
    return parsed.data;
  })
  .handler(async ({ data, context }): Promise<SaveResult> => {
    const { supabase, userId } = context;
    const accountId = await resolveAccount(supabase, userId);
    const resolvedLocations = await resolvePhysicalLocations(data.locations);

    const missing = data.publish ? validateForPublish(data) : [];
    if (data.publish && missing.length > 0) {
      return { therapist_id: "", profile_status: "draft", missing };
    }

    // Load existing profile (if any)
    const { data: existing } = await supabase
      .from("therapists")
      .select("id, slug, visibility, profile_status")
      .eq("owner_account_id", accountId)
      .maybeSingle();

    const nextStatus: ProfileStatus = data.publish
      ? "published"
      : validateForPublish(data).length === 0
        ? "completed"
        : "draft";

    // Visibility rules (see P3.1 state model):
    //  - Create: default to 'hidden' (never expose a new row).
    //  - Draft/complete save on existing row: DO NOT touch visibility.
    //  - Publish: explicit user action → 'visible'.
    //  - is_active is a technical filter flag: always true for editable
    //    rows. Only archival flips it off, and archival is not exposed here.
    const visibilityForNewRow: "hidden" = "hidden";

    const basePayload = {
      full_name: data.full_name.trim(),
      gender: data.gender ?? null,
      professional_title: data.professional_title?.trim() || null,
      full_description: data.full_description?.trim() || null,
      short_intro: data.short_intro?.trim() || null,
      background: data.background?.trim() || null,
      years_experience: data.years_experience ?? null,
      email: data.email ? data.email.trim() : null,
      phone: data.phone ? data.phone.trim() : null,
      image_url: data.image_url ? data.image_url.trim() : null,
      profile_status: nextStatus,
      is_active: true,
      city: resolvedLocations[0]?.city ?? null,
      region: resolvedLocations[0]?.region ?? null,
      ...(data.publish ? { visibility: "visible" as const } : {}),
    };

    let therapistId: string;
    if (existing) {
      const { error } = await supabase
        .from("therapists")
        .update(basePayload as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      therapistId = existing.id;
    } else {
      const slug = slugify(data.full_name);
      const { data: inserted, error } = await supabase
        .from("therapists")
        .insert({
          ...basePayload,
          visibility: data.publish ? "visible" : visibilityForNewRow,
          slug,
          owner_account_id: accountId,
          profile_claimed: true,
          country: "Israel",
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      therapistId = inserted.id;
      // Mark account as claimed on first profile creation.
      await supabase
        .from("therapist_accounts")
        .update({ account_status: "claimed", onboarding_completed: true })
        .eq("id", accountId);
    }

    // Sync m2m relationships (naive replace strategy — small sets).
    async function replaceLinks(
      table: "therapist_professions" | "therapist_modalities" | "therapist_languages" | "therapist_populations",
      column: "profession_id" | "modality_id" | "language_id" | "population_id",
      ids: string[],
    ) {
      await supabase.from(table).delete().eq("therapist_id", therapistId);
      if (ids.length === 0) return;
      const rows = ids.map((id) => ({ therapist_id: therapistId, [column]: id }));
      const { error } = await supabase.from(table).insert(rows as never);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    await replaceLinks("therapist_professions", "profession_id", data.profession_ids);
    await replaceLinks("therapist_modalities", "modality_id", data.modality_ids);
    await replaceLinks("therapist_languages", "language_id", data.language_ids);
    await replaceLinks("therapist_populations", "population_id", data.population_ids);

    // Sync the location types managed by this editor. Preserve any future or
    // externally-managed location types rather than deleting them blindly.
    const { error: locationDeleteError } = await supabase
      .from("therapist_locations")
      .delete()
      .eq("therapist_id", therapistId)
      .in("location_type", ["clinic", "online"]);
    if (locationDeleteError) throw new Error(`therapist_locations: ${locationDeleteError.message}`);

    const locRows: Array<Record<string, unknown>> = resolvedLocations.map((location, index) => ({
      therapist_id: therapistId,
      location_type: "clinic",
      city: location.city,
      region: location.region,
      address: location.address,
      country: "Israel",
      is_primary: index === 0,
      is_active: true,
    }));

    if (data.online_available) {
      locRows.push({
        therapist_id: therapistId,
        location_type: "online",
        country: "Israel",
        is_primary: resolvedLocations.length === 0,
        is_active: true,
      });
    }
    if (locRows.length > 0) {
      const { error } = await supabase.from("therapist_locations").insert(locRows as never);
      if (error) throw new Error(`therapist_locations: ${error.message}`);
    }

    return { therapist_id: therapistId, profile_status: nextStatus };
  });

/* ------------------------------------------------------------------ */
/* Semantic feedback (P3.2)                                           */
/* ------------------------------------------------------------------ */

/**
 * Read-only view of the treatment domains SemanticEngine recognized in the
 * therapist's professional description. Never exposes weights, confidence,
 * or ranking — the panel is transparency, not optimization guidance.
 */
export const getSemanticFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ description: z.string().max(DESCRIPTION_MAX).nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SemanticFeedback> => {
    const desc = (data.description ?? "").trim();
    if (desc.length < 20) return { domains: [] };

    // Two fixed queries (no N+1): the FULL active canonical catalog plus the
    // aliases of those active problems. Direct matching must never be gated
    // by what the semantic engine happened to propose.
    const catalog = await loadFeedbackCatalog(context.supabase as unknown as Parameters<typeof loadFeedbackCatalog>[0]);

    // Semantic extraction stays untouched; its results are only *validated*
    // against the active catalog + strict explicit evidence.
    const semantic = await SemanticEngine.extractProfile(desc, context.supabase);

    return { domains: combineFeedbackDomains(desc, catalog, semantic) };
  });
