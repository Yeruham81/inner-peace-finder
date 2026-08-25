/**
 * Public treatment-topic URLs use hyphens for readability while the catalog,
 * database and semantic search keep their established underscore identifiers.
 */
export function toPublicProblemSlug(internalSlug: string): string {
  return internalSlug.replaceAll("_", "-");
}

export function toInternalProblemSlug(publicSlug: string): string {
  return publicSlug.replaceAll("-", "_");
}

export function publicProblemPath(internalSlug: string): string {
  return `/problems/${toPublicProblemSlug(internalSlug)}`;
}
