/** Build the stable human-readable base used for a therapist's public URL. */
export function therapistSlugBase(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "therapist";
}
