export function hasTipulinksAdminClaim(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const appMetadata = (claims as { app_metadata?: unknown }).app_metadata;
  return Boolean(
    appMetadata &&
    typeof appMetadata === "object" &&
    (appMetadata as { tipulinks_role?: unknown }).tipulinks_role === "admin",
  );
}

export function requireTipulinksAdmin(
  claims: unknown,
  message = "אין הרשאת מנהל לביצוע הפעולה.",
): void {
  if (!hasTipulinksAdminClaim(claims)) throw new Error(message);
}
