import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";
import { REGION_DEFINITIONS, REGION_SLUGS } from "./locality-options";

export type AdminCatalogItem = {
  name: string;
  slug: string;
  active: boolean;
  order: number;
};

export type AdminCatalog = {
  key: "professions" | "domains" | "populations" | "modalities" | "languages" | "locations";
  label: string;
  items: AdminCatalogItem[];
};

export const listAdminCatalogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCatalog[]> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בקטלוגים.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [professions, problems, populations, modalities, languages] = await Promise.all([
      supabaseAdmin
        .from("professions")
        .select("slug, name_he, is_active, sort_order")
        .order("sort_order", { ascending: true })
        .order("name_he", { ascending: true }),
      supabaseAdmin
        .from("problems")
        .select("slug, name_he, is_active, sort_order")
        .order("sort_order", { ascending: true })
        .order("name_he", { ascending: true }),
      supabaseAdmin
        .from("population_groups")
        .select("slug, name, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("treatment_modalities")
        .select("slug, name_he, is_active, sort_order")
        .order("sort_order", { ascending: true })
        .order("name_he", { ascending: true }),
      supabaseAdmin.from("languages").select("code, name").order("name", { ascending: true }),
    ]);

    for (const result of [professions, problems, populations, modalities, languages]) {
      if (result.error) throw new Error(result.error.message);
    }

    return [
      {
        key: "professions",
        label: "מקצועות",
        items: (professions.data ?? []).map((row) => ({
          name: row.name_he,
          slug: row.slug,
          active: row.is_active,
          order: row.sort_order,
        })),
      },
      {
        key: "domains",
        label: "תחומי טיפול",
        items: (problems.data ?? []).map((row) => ({
          name: row.name_he,
          slug: row.slug,
          active: row.is_active,
          order: row.sort_order,
        })),
      },
      {
        key: "populations",
        label: "אוכלוסיות",
        items: (populations.data ?? []).map((row) => ({
          name: row.name,
          slug: row.slug,
          active: true,
          order: row.sort_order,
        })),
      },
      {
        key: "modalities",
        label: "גישות ושיטות טיפוליות",
        items: (modalities.data ?? []).map((row) => ({
          name: row.name_he,
          slug: row.slug,
          active: row.is_active,
          order: row.sort_order,
        })),
      },
      {
        key: "languages",
        label: "שפות",
        items: (languages.data ?? []).map((row, index) => ({
          name: row.name,
          slug: row.code,
          active: true,
          order: index + 1,
        })),
      },
      {
        key: "locations",
        label: "אזורים / מיקומים",
        items: REGION_SLUGS.map((slug, index) => ({
          name: REGION_DEFINITIONS[slug].label,
          slug,
          active: true,
          order: index + 1,
        })),
      },
    ];
  });
