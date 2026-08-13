/**
 * Canonical labels for profile options that are stored as stable identifiers.
 * Shared by the editor and the public profile so the labels cannot drift.
 */

export const ACCESSIBILITY_STATUS_OPTIONS = [
  { id: "accessible", label: "נגישה" },
  { id: "partially_accessible", label: "נגישה חלקית" },
  { id: "not_accessible", label: "אינה נגישה" },
  { id: "unknown", label: "לא ידוע" },
];

export const ACCESSIBILITY_FEATURE_OPTIONS = [
  { id: "step_free_entrance", label: "כניסה ללא מדרגות" },
  { id: "accessible_elevator", label: "מעלית נגישה" },
  { id: "accessible_restroom", label: "שירותים נגישים" },
  { id: "accessible_parking", label: "חניית נכים" },
  { id: "wide_doorways", label: "פתחים רחבים" },
  { id: "hearing_loop", label: "לולאת השראה" },
];

export const FREE_INTRO_TYPE_OPTIONS = [
  { id: "phone", label: "טלפון" },
  { id: "video", label: "וידאו" },
  { id: "in_person", label: "פגישה בקליניקה" },
];

function labelsForIds(
  ids: readonly string[],
  options: Array<{ id: string; label: string }>,
): string[] {
  const requested = new Set(ids);
  return options.filter((option) => requested.has(option.id)).map((option) => option.label);
}

export function accessibilityFeatureLabels(features: readonly string[]): string[] {
  return labelsForIds(features, ACCESSIBILITY_FEATURE_OPTIONS);
}

export function freeIntroTypeLabels(types: readonly string[]): string[] {
  return labelsForIds(types, FREE_INTRO_TYPE_OPTIONS);
}

export function clinicAccessibilityLabel(status: string): string | null {
  if (status === "accessible") return "קליניקה נגישה";
  if (status === "partially_accessible") return "קליניקה נגישה חלקית";
  if (status === "not_accessible") return "הקליניקה אינה נגישה";
  return null;
}
