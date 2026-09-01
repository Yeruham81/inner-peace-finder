import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { SemanticEngine } from "./semantic-engine";
import { combineFeedbackDomains, loadFeedbackCatalog } from "./profile-domain-feedback";
import { computeSemanticProfile } from "./profile-semantic-sync";
import type { CredentialStatus } from "./credential-workflow";
import { CANONICAL_LANGUAGE_CODES, orderCanonicalLanguages } from "./language-options";
import { therapistSlugBase } from "./therapist-slug";
import { looksLikeEmailAddress } from "./contact-validation";
import { CONTACT_POLICY_SAVE_ERROR, scanProfileContactPolicy } from "./profile-contact-policy";
import { looksLikeIsraeliPhone } from "./phone-il";
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
export type ContactMethod = "whatsapp" | "email" | "phone";

export type CredentialEditorData = {
  id: string;
  profession_id: string | null;
  credential_type: string;
  institution: string | null;
  license_number: string | null;
  document_url: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expires_at: string | null;
  verification_status: CredentialStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  updated_at: string;
};

export type ProfileEditorData = {
  id: string | null;
  full_name: string;
  gender: Gender | null;
  professional_title: string | null;
  full_description: string | null;
  short_intro: string | null;
  education_training: string | null;
  professional_experience: string | null;
  years_experience: number | null;
  email: string | null;
  phone: string | null;
  contact_methods: ContactMethod[];
  preferred_contact_method: ContactMethod | null;
  image_url: string | null;
  slug: string | null;
  profile_status: ProfileStatus;
  is_active: boolean;
  visibility: "visible" | "hidden";
  verified: boolean;
  profession_ids: string[];
  modality_ids: string[];
  language_ids: string[];
  population_ids: string[];
  locations: {
    city: string;
    region: ProductRegion | null;
    address: string | null;
    is_primary: boolean;
    accessibility_status: string;
    accessibility_features: string[];
    accessibility_note: string | null;
  }[];
  online_available: boolean;
  home_visit_available: boolean;
  home_visit_regions: ProductRegion[];
  therapy_format_ids: string[];
  lgbtq_affirming: boolean;
  offers_free_intro: boolean;
  free_intro_types: string[];
  free_intro_duration_minutes: number | null;
  professional_memberships: {
    organization_name: string;
    member_since: number | null;
    membership_start_date: string | null;
  }[];
  service_arrangements: { organization_name: string; note: string | null }[];
  credentials: CredentialEditorData[];
};

export type EditorOptions = {
  professions: { id: string; name_he: string; slug: string }[];
  modalities: { id: string; name_he: string; slug: string }[];
  languages: { id: string; name: string; code: string }[];
  populations: { id: string; name: string; slug: string }[];
  localities: LocalityOption[];
  locality_options_error: boolean;
  therapy_formats: { id: string; name_he: string; slug: string }[];
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

export const DESCRIPTION_MAX = 4000;

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function hasTipulinksAdminClaim(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const appMetadata = (claims as { app_metadata?: unknown }).app_metadata;
  if (!appMetadata || typeof appMetadata !== "object") return false;
  return (appMetadata as { tipulinks_role?: unknown }).tipulinks_role === "admin";
}

export const getProfileEditorActorMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    is_admin: hasTipulinksAdminClaim(context.claims),
  }));

/* ------------------------------------------------------------------ */
/* Schema                                                             */
/* ------------------------------------------------------------------ */

const ContactMethodSchema = z.enum(["whatsapp", "email", "phone"]);

const OptionalContactEmailSchema = z
  .string()
  .trim()
  .max(160, "כתובת האימייל ארוכה מדי.")
  .refine((value) => value === "" || looksLikeEmailAddress(value), "כתובת אימייל לא תקינה.")
  .nullable()
  .optional();

const OptionalIsraeliPhoneSchema = z
  .string()
  .trim()
  .max(40, "מספר הטלפון ארוך מדי.")
  .refine((value) => value === "" || looksLikeIsraeliPhone(value), "מספר טלפון ישראלי לא תקין.")
  .nullable()
  .optional();

const SaveSchema = z
  .object({
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
    education_training: z.string().trim().max(4000, "טקסט ההשכלה וההכשרה ארוך מדי.").nullable().optional(),
    professional_experience: z.string().trim().max(4000, "טקסט הניסיון המקצועי ארוך מדי.").nullable().optional(),
    years_experience: z
      .number()
      .int("שנות ניסיון חייבות להיות מספר שלם.")
      .min(0, "שנות ניסיון לא יכולות להיות שליליות.")
      .max(80, "שנות ניסיון לא תקין.")
      .nullable()
      .optional(),
    email: OptionalContactEmailSchema,
    phone: OptionalIsraeliPhoneSchema,
    contact_methods: z
      .array(ContactMethodSchema)
      .max(3, "ניתן לבחור עד שלוש דרכי התקשרות.")
      .refine((methods) => new Set(methods).size === methods.length, "לא ניתן לבחור אותה דרך התקשרות יותר מפעם אחת.")
      .default([]),
    preferred_contact_method: ContactMethodSchema.nullable().optional(),
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
          accessibility_status: z
            .enum(["accessible", "partially_accessible", "not_accessible", "unknown"])
            .default("unknown"),
          accessibility_features: z
            .array(
              z.enum([
                "step_free_entrance",
                "accessible_elevator",
                "accessible_restroom",
                "accessible_parking",
                "wide_doorways",
                "hearing_loop",
              ]),
            )
            .max(6)
            .default([]),
          accessibility_note: z.string().trim().max(500).nullable().optional().or(z.literal("")),
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
    home_visit_available: z.boolean().default(false),
    home_visit_regions: z
      .array(z.enum(PRODUCT_REGIONS))
      .max(PRODUCT_REGIONS.length, "נבחרו יותר מדי אזורי ביקורי בית.")
      .refine(
        (regions) => new Set(regions).size === regions.length,
        "לא ניתן לבחור אותו אזור ביקורי בית יותר מפעם אחת.",
      )
      .default([]),
    therapy_format_ids: z.array(z.string().uuid()).max(6).default([]),
    lgbtq_affirming: z.boolean().default(false),
    offers_free_intro: z.boolean().default(false),
    free_intro_types: z
      .array(z.enum(["phone", "video", "in_person"]))
      .max(3)
      .default([]),
    free_intro_duration_minutes: z.number().int().min(5).max(120).nullable().optional(),
    professional_memberships: z
      .array(
        z.object({
          organization_name: z.string().trim().min(2).max(160),
          member_since: z.number().int().min(1900).max(2100).nullable().optional(),
          membership_start_date: z.string().date().nullable().optional(),
        }),
      )
      .max(20)
      .default([]),
    service_arrangements: z
      .array(
        z.object({
          organization_name: z.string().trim().min(2).max(160),
          note: z.string().trim().max(500).nullable().optional(),
        }),
      )
      .max(20)
      .default([]),
    publish: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.contact_methods.length === 0) {
      if (data.preferred_contact_method) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["preferred_contact_method"],
          message: "יש לבחור דרך התקשרות לפני שמגדירים דרך מועדפת.",
        });
      }
      return;
    }

    if (!data.preferred_contact_method || !data.contact_methods.includes(data.preferred_contact_method)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferred_contact_method"],
        message: "יש לבחור דרך התקשרות מועדפת מתוך הדרכים הפעילות.",
      });
    }
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
      return first.message || "כתובת אימייל לא תקינה.";
    case "phone":
      return first.message || "מספר טלפון לא תקין.";
    case "contact_methods":
    case "preferred_contact_method":
      return first.message || "נא לבדוק את דרכי ההתקשרות שנבחרו.";
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
  const { data: existing, error: existingError } = await supabase
    .from("therapist_accounts")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (existingError) throw new Error(`therapist_accounts: ${existingError.message}`);
  if (existing) return existing.id as string;

  const { assertTherapistRegistrationEnabled } = await import("./therapist-registration-settings.server");
  await assertTherapistRegistrationEnabled();

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

  const [profs, mods, langs, pops, formats, localityResult] = await Promise.all([
    sb.from("professions").select("id, name_he, slug").eq("is_active", true).order("sort_order"),
    sb.from("treatment_modalities").select("id, name_he, slug").eq("is_active", true).order("sort_order"),
    sb
      .from("languages")
      .select("id, name, code")
      .in("code", [...CANONICAL_LANGUAGE_CODES]),
    sb.from("population_groups").select("id, name, slug").order("sort_order"),
    sb.from("therapy_formats").select("id, name_he, slug").eq("is_active", true).order("sort_order"),
    localitiesPromise,
  ]);

  // Core editor catalogs must fail closed. Returning [] on a database error
  // would make existing options appear to have been deleted and could lead to
  // an invalid or destructive save. Locality loading intentionally keeps its
  // separate fallback flag because the editor already handles that case.
  for (const [catalog, result] of [
    ["professions", profs],
    ["treatment_modalities", mods],
    ["languages", langs],
    ["population_groups", pops],
    ["therapy_formats", formats],
  ] as const) {
    if (result.error) throw new Error(`${catalog}: ${result.error.message}`);
  }

  return {
    professions: profs.data ?? [],
    modalities: mods.data ?? [],
    languages: orderCanonicalLanguages(langs.data ?? []),
    populations: pops.data ?? [],
    therapy_formats: formats.data ?? [],
    localities: localityResult.items,
    locality_options_error: localityResult.error,
  };
});

/* ------------------------------------------------------------------ */
/* Get my profile                                                     */
/* ------------------------------------------------------------------ */

async function loadProfileEditorData(
  supabase: SupabaseClient<Database>,
  therapistId: string,
): Promise<ProfileEditorData | null> {
  const { data: t, error: profileError } = await supabase
    .from("therapists")
    .select("*")
    .eq("id", therapistId)
    .maybeSingle();
  if (profileError) throw new Error(`therapists: ${profileError.message}`);
  if (!t) return null;

  const [profs, mods, langs, pops, locs, formats, memberships, arrangements, credentials] = await Promise.all([
    supabase.from("therapist_professions").select("profession_id").eq("therapist_id", t.id),
    supabase.from("therapist_modalities").select("modality_id").eq("therapist_id", t.id),
    supabase.from("therapist_languages").select("language_id").eq("therapist_id", t.id),
    supabase.from("therapist_populations").select("population_id").eq("therapist_id", t.id),
    supabase.from("therapist_locations").select("*").eq("therapist_id", t.id).eq("is_active", true),
    supabase.from("therapist_therapy_formats").select("therapy_format_id").eq("therapist_id", t.id),
    supabase
      .from("therapist_professional_memberships")
      .select("organization_name, member_since, membership_start_date")
      .eq("therapist_id", t.id)
      .order("sort_order"),
    supabase
      .from("therapist_service_arrangements")
      .select("organization_name, note")
      .eq("therapist_id", t.id)
      .order("sort_order"),
    supabase
      .from("therapist_credentials")
      .select(
        "id, profession_id, credential_type, institution, license_number, document_url, issuing_authority, issue_date, expires_at, verification_status, rejection_reason, submitted_at, updated_at",
      )
      .eq("therapist_id", t.id)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true }),
  ]);

  // A failed relation query must never be flattened into an empty editor
  // field. That would let a temporary read failure look like saved data was
  // deleted and could cause the next save to overwrite valid relations.
  for (const [relation, result] of [
    ["therapist_professions", profs],
    ["therapist_modalities", mods],
    ["therapist_languages", langs],
    ["therapist_populations", pops],
    ["therapist_locations", locs],
    ["therapist_therapy_formats", formats],
    ["therapist_professional_memberships", memberships],
    ["therapist_service_arrangements", arrangements],
    ["therapist_credentials", credentials],
  ] as const) {
    if (result.error) throw new Error(`${relation}: ${result.error.message}`);
  }

  const physicalLocations = (locs.data ?? [])
    .filter((location) => location.location_type === "clinic")
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
  const online = (locs.data ?? []).some((l) => l.location_type === "online");
  const homeVisitLocations = (locs.data ?? []).filter((location) => location.location_type === "home_visit");
  const homeVisitRegions = [
    ...new Set(
      homeVisitLocations
        .map((location) => location.region)
        .filter((region): region is ProductRegion => PRODUCT_REGIONS.includes(region as ProductRegion)),
    ),
  ];

  return {
    id: t.id,
    full_name: t.full_name,
    gender: (t.gender as Gender | null) ?? null,
    professional_title: t.professional_title,
    full_description: t.full_description,
    short_intro: t.short_intro,
    education_training: t.education_training ?? null,
    professional_experience: t.professional_experience ?? null,
    years_experience: t.years_experience ?? null,
    email: (t as { email?: string | null }).email ?? null,
    phone: t.phone,
    contact_methods: ((t.contact_methods ?? []) as string[]).filter(
      (method): method is ContactMethod => method === "whatsapp" || method === "email" || method === "phone",
    ),
    preferred_contact_method:
      t.preferred_contact_method === "whatsapp" ||
      t.preferred_contact_method === "email" ||
      t.preferred_contact_method === "phone"
        ? t.preferred_contact_method
        : null,
    image_url: t.image_url,
    slug: t.slug,
    profile_status: (t as { profile_status: ProfileStatus }).profile_status,
    is_active: t.is_active,
    visibility: t.visibility === "visible" ? "visible" : "hidden",
    verified: Boolean(t.verified),
    profession_ids: (profs.data ?? []).map((r) => r.profession_id),
    modality_ids: (mods.data ?? []).map((r) => r.modality_id),
    language_ids: (langs.data ?? []).map((r) => r.language_id),
    population_ids: (pops.data ?? []).map((r) => r.population_id),
    locations: physicalLocations.map((location) => ({
      city: location.city ?? "",
      region: PRODUCT_REGIONS.includes(location.region as ProductRegion) ? (location.region as ProductRegion) : null,
      address: location.address ?? null,
      is_primary: Boolean(location.is_primary),
      accessibility_status: location.accessibility_status,
      accessibility_features: location.accessibility_features,
      accessibility_note: location.accessibility_note,
    })),
    online_available: online,
    home_visit_available: homeVisitLocations.length > 0,
    home_visit_regions: homeVisitRegions,
    therapy_format_ids: (formats.data ?? []).map((row) => row.therapy_format_id),
    lgbtq_affirming: Boolean(t.lgbtq_affirming),
    offers_free_intro: Boolean(t.offers_free_intro),
    free_intro_types: t.free_intro_types ?? [],
    free_intro_duration_minutes: t.free_intro_duration_minutes,
    professional_memberships: memberships.data ?? [],
    service_arrangements: arrangements.data ?? [],
    credentials: (credentials.data ?? []) as CredentialEditorData[],
  };
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileEditorData | null> => {
    const { supabase, userId } = context;
    const accountId = await resolveAccount(supabase, userId);
    const { data: owned, error } = await supabase
      .from("therapists")
      .select("id")
      .eq("owner_account_id", accountId)
      .maybeSingle();
    if (error) throw new Error(`therapists: ${error.message}`);
    if (!owned) return null;
    return loadProfileEditorData(supabase, owned.id);
  });

const AdminManagedProfileSchema = z.object({ therapist_id: z.string().uuid() });

export const getAdminManagedProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AdminManagedProfileSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProfileEditorData | null> => {
    if (!hasTipulinksAdminClaim(context.claims)) {
      throw new Error("אין הרשאת מנהל לעריכת פרופיל זה.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error } = await supabaseAdmin
      .from("therapists")
      .select("id")
      .eq("id", data.therapist_id)
      .eq("profile_origin", "admin_public_info")
      .is("owner_account_id", null)
      .eq("do_not_republish", false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!target) return null;

    return loadProfileEditorData(supabaseAdmin, target.id);
  });

/* ------------------------------------------------------------------ */
/* Validation for publish                                             */
/* ------------------------------------------------------------------ */

function validateForPublish(
  input: SaveInput,
  semanticProfile: readonly { slug: string; weight: number }[],
  saveMode: "self" | "admin_public_info" = "self",
): string[] {
  const missing: string[] = [];
  if (saveMode === "admin_public_info" && !input.email?.trim()) {
    missing.push("אימייל מקצועי");
  }
  if (!input.full_name || input.full_name.trim().length < 2) missing.push("שם מלא");
  if (!input.gender) missing.push("מין");
  if (!input.professional_title || input.professional_title.trim().length === 0) missing.push("כותרת מקצועית");
  if (!input.profession_ids || input.profession_ids.length === 0) missing.push("מקצועות");
  if (semanticProfile.length === 0) missing.push('תחום טיפול אחד לפחות מתוך "קצת עליי"');
  if (!input.language_ids || input.language_ids.length === 0) missing.push("שפות");
  if (!input.population_ids || input.population_ids.length === 0) missing.push("אוכלוסיות טיפול");
  if (!input.contact_methods || input.contact_methods.length === 0) {
    missing.push("דרכי התקשרות");
  } else {
    if (!input.preferred_contact_method || !input.contact_methods.includes(input.preferred_contact_method)) {
      missing.push("דרך התקשרות מועדפת");
    }
    if (input.contact_methods.includes("email") && !input.email) {
      missing.push("כתובת אימייל");
    }
    if ((input.contact_methods.includes("whatsapp") || input.contact_methods.includes("phone")) && !input.phone) {
      missing.push("מספר טלפון");
    }
  }
  const hasPhysicalLocation = input.locations.length > 0;
  if (input.home_visit_available && input.home_visit_regions.length === 0) missing.push("אזורי ביקורי בית");
  if (!hasPhysicalLocation && !input.online_available && !input.home_visit_available) {
    missing.push("מיקום פיזי, טיפול אונליין או ביקורי בית");
  }
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

async function saveProfileForActor(args: {
  data: SaveInput;
  supabase: SupabaseClient<Database>;
  userId: string;
  saveMode: "self" | "admin_public_info";
  targetTherapistId?: string | null;
}): Promise<SaveResult> {
  const { data, supabase, userId, saveMode, targetTherapistId = null } = args;
  const ownerAccountId = saveMode === "self" ? await resolveAccount(supabase, userId) : null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const existingProfileQuery =
    saveMode === "self"
      ? supabaseAdmin
          .from("therapists")
          .select("id, profile_status")
          .eq("owner_account_id", ownerAccountId!)
          .maybeSingle()
      : targetTherapistId
        ? supabaseAdmin.from("therapists").select("id, profile_status").eq("id", targetTherapistId).maybeSingle()
        : Promise.resolve({ data: null, error: null });
  const { data: existingProfile, error: existingProfileError } = await existingProfileQuery;
  if (existingProfileError) throw new Error(existingProfileError.message);

  const contactPolicyScan = saveMode === "self" ? scanProfileContactPolicy(data) : null;
  if (contactPolicyScan && contactPolicyScan.findings.length > 0) {
    const { error: violationError } = await supabaseAdmin.rpc("record_profile_contact_policy_violation", {
      _actor: userId,
      // Generated RPC arg types omit the SQL DEFAULT NULL nullability.
      _therapist_id: (existingProfile?.id ?? null) as unknown as string,
      _violation_types: contactPolicyScan.types,
      _field_names: contactPolicyScan.fieldKeys,
    });
    if (violationError) console.error("[profile-contact-policy] failed to record blocked save", violationError);
    throw new Error(CONTACT_POLICY_SAVE_ERROR);
  }

  const resolvedLocations = await resolvePhysicalLocations(data.locations);

  if (saveMode === "admin_public_info" && data.email?.trim()) {
    const { data: suppressed, error: suppressionError } = await supabaseAdmin.rpc("is_contact_email_suppressed", {
      _email: data.email.trim(),
    });
    if (suppressionError) throw new Error(suppressionError.message);
    if (suppressed) {
      throw new Error("כתובת האימייל נמצאת ברשימת אי־פנייה. אין ליצור עבורה פרופיל או לשלוח אליה הזמנה.");
    }
  }

  // Recompute the semantic source of truth BEFORE any write. A catalog or
  // extraction failure must abort the save/publish instead of persisting an
  // outdated (or silently emptied) semantic_profile.
  const semanticProfile = await computeSemanticProfile(data.full_description, supabase);
  const readinessMissing = validateForPublish(data, semanticProfile, saveMode);
  if (data.publish && readinessMissing.length > 0) {
    return { therapist_id: "", profile_status: "draft", missing: readinessMissing };
  }

  const preservePublishedStatus = existingProfile?.profile_status === "published" && readinessMissing.length === 0;

  const nextStatus: ProfileStatus = data.publish
    ? "published"
    : preservePublishedStatus
      ? "published"
      : readinessMissing.length === 0
        ? "completed"
        : "draft";

  // Location rows managed by this editor. Any other location type is left
  // untouched by the database operation below.
  const locationRows: Array<Record<string, unknown>> = resolvedLocations.map((location, index) => ({
    location_type: "clinic",
    city: location.city,
    region: location.region,
    address: location.address,
    accessibility_status: data.locations[index]?.accessibility_status ?? "unknown",
    accessibility_features: data.locations[index]?.accessibility_features ?? [],
    accessibility_note: data.locations[index]?.accessibility_note ?? null,
    is_primary: index === 0,
  }));

  if (data.online_available) {
    locationRows.push({
      location_type: "online",
      is_primary: resolvedLocations.length === 0,
    });
  }

  if (data.home_visit_available) {
    if (data.home_visit_regions.length > 0) {
      for (const region of data.home_visit_regions) {
        locationRows.push({ location_type: "home_visit", region, is_primary: false });
      }
    } else {
      // Preserve the checkbox state in drafts. Publishing requires at least
      // one service region, so a region-less home_visit row is never a
      // complete public configuration.
      locationRows.push({ location_type: "home_visit", is_primary: false });
    }
  }

  // Slugs are human-readable and stable. A BEFORE INSERT database trigger
  // serializes same-name creations and turns this base into name, name-2,
  // name-3, ... . Updates never rewrite the slug.
  const requestedSlug = therapistSlugBase(data.full_name);

  // Visibility / status / verification columns are decided here and applied by
  // the database operation; the browser cannot write them at all. A single
  // transactional call replaces the previous multi-statement sequence, so a
  // failure anywhere leaves the previously saved profile fully intact.
  const payload = {
    profile: {
      slug: requestedSlug,
      full_name: data.full_name.trim(),
      gender: data.gender ?? null,
      professional_title: data.professional_title?.trim() || null,
      full_description: data.full_description?.trim() || null,
      short_intro: data.short_intro?.trim() || null,
      education_training: data.education_training?.trim() || null,
      professional_experience: data.professional_experience?.trim() || null,
      years_experience: data.years_experience ?? null,
      email: data.email ? data.email.trim() : null,
      phone: data.phone ? data.phone.trim() : null,
      contact_methods: data.contact_methods,
      preferred_contact_method: data.preferred_contact_method ?? null,
      image_url: data.image_url ? data.image_url.trim() : null,
      lgbtq_affirming: data.lgbtq_affirming,
      offers_free_intro: data.offers_free_intro,
      free_intro_types: data.offers_free_intro ? data.free_intro_types : [],
      free_intro_duration_minutes: data.offers_free_intro ? (data.free_intro_duration_minutes ?? null) : null,
      city: resolvedLocations[0]?.city ?? null,
      region: resolvedLocations[0]?.region ?? null,
      profile_status: nextStatus,
      publish: data.publish,
    },
    semantic_profile: semanticProfile,
    profession_ids: data.profession_ids,
    modality_ids: data.modality_ids,
    language_ids: data.language_ids,
    population_ids: data.population_ids,
    therapy_format_ids: data.therapy_format_ids,
    professional_memberships: data.professional_memberships,
    service_arrangements: data.service_arrangements,
    locations: locationRows,
    save_mode: saveMode,
    target_therapist_id: saveMode === "admin_public_info" ? targetTherapistId : null,
  };

  const { data: saved, error } = await supabaseAdmin.rpc("save_therapist_profile_with_contacts", {
    // Ownership is resolved inside the transaction from the verified auth
    // user id — never from anything the browser supplied.
    _actor: userId,
    _payload: payload as never,
  });
  if (error) {
    if (error.message.includes("contact_email_suppressed")) {
      throw new Error("כתובת האימייל נמצאת ברשימת אי־פנייה. אין ליצור עבורה פרופיל או לשלוח אליה הזמנה.");
    }
    throw new Error(error.message);
  }
  const result = (saved ?? {}) as { therapist_id?: string; profile_status?: ProfileStatus };
  if (!result.therapist_id) throw new Error("שמירת הפרופיל נכשלה. נסו שוב.");

  return {
    therapist_id: result.therapist_id,
    profile_status: result.profile_status ?? nextStatus,
  };
}

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = SaveSchema.safeParse(input);
    if (!parsed.success) throw new Error(friendlyZodMessage(parsed.error));
    return parsed.data;
  })
  .handler(
    async ({ data, context }): Promise<SaveResult> =>
      saveProfileForActor({
        data,
        supabase: context.supabase,
        userId: context.userId,
        saveMode: "self",
      }),
  );

const AdminSaveInputSchema = z.object({
  therapist_id: z.string().uuid().nullable().optional(),
  profile: z.unknown(),
});

export const saveAdminManagedProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const outer = AdminSaveInputSchema.parse(input);
    const profile = SaveSchema.safeParse(outer.profile);
    if (!profile.success) throw new Error(friendlyZodMessage(profile.error));
    return { therapist_id: outer.therapist_id ?? null, profile: profile.data };
  })
  .handler(async ({ data, context }): Promise<SaveResult> => {
    if (!hasTipulinksAdminClaim(context.claims)) {
      throw new Error("אין הרשאת מנהל ליצירת פרופיל מטעם Tipulinks.");
    }

    return saveProfileForActor({
      data: data.profile,
      supabase: context.supabase,
      userId: context.userId,
      saveMode: "admin_public_info",
      targetTherapistId: data.therapist_id,
    });
  });

const ContactPreferencesSchema = z
  .object({
    email: OptionalContactEmailSchema,
    phone: OptionalIsraeliPhoneSchema,
    contact_methods: z
      .array(ContactMethodSchema)
      .min(1, "יש לבחור לפחות דרך התקשרות אחת.")
      .max(3, "ניתן לבחור עד שלוש דרכי התקשרות.")
      .refine((methods) => new Set(methods).size === methods.length, "לא ניתן לבחור אותה דרך התקשרות יותר מפעם אחת."),
    preferred_contact_method: ContactMethodSchema,
  })
  .superRefine((data, ctx) => {
    if (!data.contact_methods.includes(data.preferred_contact_method)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferred_contact_method"],
        message: "יש לבחור דרך התקשרות מועדפת מתוך הדרכים הפעילות.",
      });
    }

    const email = data.email?.trim() ?? "";
    if (data.contact_methods.includes("email") && !email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "יש להזין כתובת אימייל לקבלת פניות.",
      });
    }

    const phone = data.phone?.trim() ?? "";
    if ((data.contact_methods.includes("whatsapp") || data.contact_methods.includes("phone")) && !phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "יש להזין מספר טלפון לקבלת פניות.",
      });
    }
  });

const ProfileVisibilitySchema = z.object({ visible: z.boolean() });

export const setMyProfileVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProfileVisibilitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const accountId = await resolveAccount(context.supabase, context.userId);
    const { setOwnedProfileVisibility } = await import("./profile-management.server");
    return setOwnedProfileVisibility(accountId, data.visible);
  });

export const updateMyContactPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = ContactPreferencesSchema.safeParse(input);
    if (!parsed.success) throw new Error(friendlyZodMessage(parsed.error));
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const accountId = await resolveAccount(context.supabase, context.userId);
    const { updateOwnedProfileContactPreferences } = await import("./profile-management.server");
    return updateOwnedProfileContactPreferences(accountId, {
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      contact_methods: data.contact_methods,
      preferred_contact_method: data.preferred_contact_method,
    });
  });

export const deleteMyProfilePermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ confirmation: z.literal("מחיקת הפרופיל לצמיתות") }).parse(input))
  .handler(async ({ context }) => {
    await resolveAccount(context.supabase, context.userId);
    const { permanentlyDeleteOwnedProfile } = await import("./profile-management.server");
    return permanentlyDeleteOwnedProfile(context.userId);
  });

export const deleteMyAccountPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ confirmation: z.literal("מחיקת החשבון לצמיתות") }).parse(input))
  .handler(async ({ context }) => {
    await resolveAccount(context.supabase, context.userId);
    const { beginOwnedAccountDeletion } = await import("./account-deletion.server");
    const prepared = await beginOwnedAccountDeletion(context.userId);

    if (prepared.status !== "ready_to_delete") return prepared;

    const { permanentlyDeleteOwnedAccount } = await import("./profile-management.server");
    return permanentlyDeleteOwnedAccount(context.userId);
  });

export const settleAndDeleteMyAccountPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        confirmation: z.literal("מחיקת החשבון לצמיתות"),
        requestId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await resolveAccount(context.supabase, context.userId);
    const { settleOwnedAccountDeletionBalance } = await import("./account-deletion.server");
    const settlement = await settleOwnedAccountDeletionBalance(context.userId, data.requestId);

    if (settlement.status !== "ready_to_delete") return settlement;

    const { permanentlyDeleteOwnedAccount } = await import("./profile-management.server");
    return permanentlyDeleteOwnedAccount(context.userId);
  });

const CredentialSubmissionSchema = z.object({
  credential_id: z.string().uuid().nullable().optional(),
  profession_id: z.string().uuid(),
  credential_type: z.string().trim().min(2).max(120),
  institution: z.string().trim().max(160).nullable().optional(),
  license_number: z.string().trim().min(2).max(120),
  document_url: z.string().trim().min(3).max(500),
  issuing_authority: z.string().trim().min(2).max(160),
  issue_date: z.string().date().nullable().optional(),
});

export const submitMyCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CredentialSubmissionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const accountId = await resolveAccount(context.supabase, context.userId);
    const { data: profile, error: profileError } = await context.supabase
      .from("therapists")
      .select("id")
      .eq("owner_account_id", accountId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("יש לבצע שמירת פרופיל לפני הגשת מסמך הסמכה.");

    // The document must live in the authenticated user's own private folder AND
    // the stored object itself must exist and really be a PDF/JPG/PNG under
    // 10MB — a client-declared MIME type is never trusted.
    const { verifyStoredCredentialObject } = await import("./credential-object-verification.server");
    await verifyStoredCredentialObject(data.document_url, context.userId);

    // Verification columns are server-owned; the client never supplies them.
    const payload = {
      therapist_id: profile.id,
      profession_id: data.profession_id,
      credential_type: data.credential_type,
      institution: data.institution || null,
      license_number: data.license_number,
      document_url: data.document_url,
      issuing_authority: data.issuing_authority,
      issue_date: data.issue_date ?? null,
      submitted_at: new Date().toISOString(),
      verification_status: "pending_review" as const,
      rejection_reason: null,
      verified_by: null,
      verified_at: null,
    };

    // Authentication, ownership and input validation all passed above, so the
    // controlled write runs through the server-only admin client (the
    // authenticated role intentionally cannot touch verification columns).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.credential_id) {
      const { data: owned, error: ownedError } = await context.supabase
        .from("therapist_credentials")
        .select("id, verification_status")
        .eq("id", data.credential_id)
        .eq("therapist_id", profile.id)
        .maybeSingle();
      if (ownedError) throw new Error(ownedError.message);
      if (!owned) throw new Error("רשומת ההסמכה אינה שייכת לפרופיל.");
      if (owned.verification_status === "verified") throw new Error("לא ניתן לשנות הסמכה שכבר אומתה.");
      if (owned.verification_status === "expired")
        throw new Error("לא ניתן לעדכן הסמכה שתוקפה פג. יש להוסיף הסמכה חדשה.");
      const { error } = await supabaseAdmin
        .from("therapist_credentials")
        .update(payload)
        .eq("id", owned.id)
        .eq("therapist_id", profile.id);
      if (error) throw new Error(error.message);
      return { id: owned.id, verification_status: "pending_review" as const };
    }

    const { data: created, error } = await supabaseAdmin
      .from("therapist_credentials")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id, verification_status: "pending_review" as const };
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
    if (desc.length === 0) return { domains: [] };

    // Two fixed queries (no N+1): the FULL active canonical catalog plus the
    // aliases of those active problems. Direct matching must never be gated
    // by what the semantic engine happened to propose.
    const catalog = await loadFeedbackCatalog(context.supabase as unknown as Parameters<typeof loadFeedbackCatalog>[0]);

    // Semantic extraction stays untouched; its results are only *validated*
    // against the active catalog + strict explicit evidence.
    const semantic = await SemanticEngine.extractProfile(desc, context.supabase);

    return { domains: combineFeedbackDomains(desc, catalog, semantic) };
  });
