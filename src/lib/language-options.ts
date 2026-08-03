/**
 * Canonical treatment-language identifiers used across Tipulinks.
 *
 * `code` is the stable public/search identifier stored in `languages.code`.
 * The database UUID remains the internal foreign-key identifier used by
 * therapist_languages and the profile editor.
 */
export const CANONICAL_LANGUAGES = [
  { code: "he", name: "עברית" },
  { code: "en", name: "אנגלית" },
  { code: "ar", name: "ערבית" },
  { code: "ru", name: "רוסית" },
  { code: "fr", name: "צרפתית" },
  { code: "es", name: "ספרדית" },
  { code: "de", name: "גרמנית" },
  { code: "am", name: "אמהרית" },
] as const;

export type CanonicalLanguageCode = (typeof CANONICAL_LANGUAGES)[number]["code"];

export const CANONICAL_LANGUAGE_CODES = CANONICAL_LANGUAGES.map((language) => language.code);

export function orderCanonicalLanguages<T extends { code: string; name: string }>(rows: T[]): T[] {
  const byCode = new Map(rows.map((row) => [row.code, row]));

  return CANONICAL_LANGUAGES.flatMap(({ code, name }) => {
    const row = byCode.get(code);
    return row ? [{ ...row, name }] : [];
  });
}
