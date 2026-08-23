export type DisplayPreferences = {
  theme: "light" | "dark" | "system";
  palette: "tipulinks" | "ocean" | "sage";
  contrast: "standard" | "high";
  fontSize: "small" | "medium" | "large";
};

const STORAGE_KEY = "tipulinks-display-preferences";

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  theme: "system",
  palette: "tipulinks",
  contrast: "standard",
  fontSize: "medium",
};

function isChoice<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

export function getDisplayPreferences(): DisplayPreferences {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_PREFERENCES;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Partial<DisplayPreferences>;
    return {
      theme: isChoice(saved.theme, ["light", "dark", "system"]) ? saved.theme : "system",
      palette: isChoice(saved.palette, ["tipulinks", "ocean", "sage"])
        ? saved.palette
        : "tipulinks",
      contrast: isChoice(saved.contrast, ["standard", "high"]) ? saved.contrast : "standard",
      fontSize: isChoice(saved.fontSize, ["small", "medium", "large"]) ? saved.fontSize : "medium",
    };
  } catch {
    return DEFAULT_DISPLAY_PREFERENCES;
  }
}

export function applyDisplayPreferences(preferences: DisplayPreferences) {
  if (typeof document === "undefined") return;
  const systemDark =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = preferences.theme === "dark" || (preferences.theme === "system" && systemDark);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = preferences.theme;
  root.dataset.palette = preferences.palette;
  root.dataset.contrast = preferences.contrast;
  root.dataset.fontSize = preferences.fontSize;
}

export function saveDisplayPreferences(preferences: DisplayPreferences) {
  if (typeof window !== "undefined")
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  applyDisplayPreferences(preferences);
}

export function initializeDisplayPreferences() {
  if (typeof window === "undefined") return undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const applySavedPreferences = () => applyDisplayPreferences(getDisplayPreferences());
  applySavedPreferences();
  media.addEventListener("change", applySavedPreferences);
  return () => media.removeEventListener("change", applySavedPreferences);
}
