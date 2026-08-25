/** Pure contact-detail checks shared by browser UX and server validation. */

const EMAIL_LOCAL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/iu;
const EMAIL_DOMAIN_LABEL_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/iu;

/**
 * Validate email syntax only. Ownership and deliverability still require the
 * normal verification/invitation flow.
 */
export function looksLikeEmailAddress(input: string | null | undefined): boolean {
  const value = (input ?? "").trim();
  if (value.length === 0 || value.length > 160 || /\s/u.test(value)) return false;

  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local = "", domain = ""] = parts;
  if (
    local.length === 0 ||
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !EMAIL_LOCAL_PATTERN.test(local)
  ) {
    return false;
  }

  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => EMAIL_DOMAIN_LABEL_PATTERN.test(label));
}
