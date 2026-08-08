/**
 * Test-only dataset shaped exactly like the rows the production Supabase
 * queries return (including PostgREST embedded resources). Consumed by the
 * production-path regression suites through `createFakeSupabase`.
 */

import type { FakeTables } from "./fake-supabase";

const ELIGIBLE = { is_active: true, profile_status: "published", visibility: "visible" };
const INELIGIBLE = { is_active: true, profile_status: "draft", visibility: "visible" };

function therapist(
  id: string,
  full_name: string,
  gender: "male" | "female",
  eligible: boolean,
  extra: Partial<Record<string, unknown>> = {},
) {
  return {
    id,
    slug: id,
    full_name,
    professional_title: "פסיכולוג",
    image_url: null,
    city: null,
    short_intro: `תקציר עבור ${full_name}`,
    verified: true,
    gender,
    years_experience: 10,
    full_description: "טיפול רגשי",
    semantic_profile: [],
    ...(eligible ? ELIGIBLE : INELIGIBLE),
    ...extra,
  };
}

/**
 * t-haifa   — psychologist, female, Haifa, Russian, children
 * t-telaviv — psychologist, male, Tel Aviv, Hebrew, adults
 * t-hidden  — psychologist, Haifa, but NOT eligible (draft)
 */
export function searchFixture(): FakeTables {
  const therapists = [
    therapist("t-haifa", "יעל כהן", "female", true),
    therapist("t-telaviv", "דני לוי", "male", true),
    therapist("t-hidden", "נסתר נסתר", "female", false),
  ];

  const locations = [
    // Haifa: primary clinic + a second clinic + home visits in the north.
    {
      therapist_id: "t-haifa", city: "חיפה", region: "חיפה והקריות",
      location_type: "clinic", is_primary: true, is_active: true,
    },
    {
      therapist_id: "t-haifa", city: "קריית ביאליק", region: "חיפה והקריות",
      location_type: "clinic", is_primary: false, is_active: true,
    },
    {
      therapist_id: "t-haifa", city: null, region: "צפון",
      location_type: "home_visit", is_primary: false, is_active: true,
    },
    // Inactive row: must never affect filtering or display.
    {
      therapist_id: "t-haifa", city: "אילת", region: "דרום",
      location_type: "clinic", is_primary: false, is_active: false,
    },
    // Tel Aviv: online only (no region on the row).
    {
      therapist_id: "t-telaviv", city: null, region: null,
      location_type: "online", is_primary: false, is_active: true,
    },
    // A Tel Aviv clinic with NO primary marker anywhere → display fallback.
    {
      therapist_id: "t-telaviv", city: "תל אביב", region: "תל אביב וגוש דן",
      location_type: "clinic", is_primary: false, is_active: true,
    },
    {
      therapist_id: "t-hidden", city: "חיפה", region: "חיפה והקריות",
      location_type: "clinic", is_primary: true, is_active: true,
    },
  ].map((l) => ({
    ...l,
    therapists: therapists.find((t) => t.id === l.therapist_id)!,
  }));

  return {
    therapists,
    professions: [
      { id: "p1", slug: "psychologist", name_he: "פסיכולוג", name_en: "Psychologist", is_active: true },
      { id: "p2", slug: "social-worker", name_he: "עובד סוציאלי", name_en: "Social worker", is_active: true },
      { id: "p3", slug: "psychiatrist", name_he: "פסיכיאטר", name_en: "Psychiatrist", is_active: true },
      { id: "p4", slug: "therapist", name_he: "מטפל", name_en: "Therapist", is_active: true },
    ],
    treatment_modalities: [
      { id: "m1", slug: "cbt", name_he: "CBT", name_en: "CBT", is_active: true },
    ],
    population_groups: [
      { id: "g1", slug: "children", name: "ילדים" },
      { id: "g2", slug: "adults", name: "מבוגרים" },
    ],
    languages: [
      { id: "l1", code: "ru", name: "רוסית" },
      { id: "l2", code: "he", name: "עברית" },
    ],
    therapist_locations: locations,
    therapist_professions: [
      { therapist_id: "t-haifa", professions: { slug: "psychologist" } },
      { therapist_id: "t-telaviv", professions: { slug: "psychologist" } },
      { therapist_id: "t-hidden", professions: { slug: "psychologist" } },
    ],
    therapist_modalities: [
      { therapist_id: "t-haifa", treatment_modalities: { slug: "cbt" } },
    ],
    therapist_populations: [
      { therapist_id: "t-haifa", population_groups: { slug: "children", name: "ילדים" } },
      { therapist_id: "t-telaviv", population_groups: { slug: "adults", name: "מבוגרים" } },
    ],
    therapist_languages: [
      { therapist_id: "t-haifa", languages: { code: "ru", name: "רוסית" } },
      { therapist_id: "t-telaviv", languages: { code: "he", name: "עברית" } },
    ],
    problems: [{ id: "1", slug: "anxiety", name: "חרדה" }],
    problem_aliases: [{ problem_id: "1", alias: "חרדות" }],
    problem_intents: [{ problem_slug: "anxiety", intent_text: "אני חרד כל הזמן" }],
  };
}