export const SITE_ORIGIN = "https://tipulinks.co.il";
export const SITE_NAME = "טיפולינקס";

export function absoluteUrl(path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${SITE_ORIGIN}/`).toString();
}

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Keep route-provided text from terminating the JSON-LD script element.
 * JSON.parse still restores the original value because the replacement is a
 * valid JSON unicode escape.
 */
export function serializeJsonLd(value: unknown): string {
  const serialized = JSON.stringify(value);
  return (serialized ?? "null").replace(/</g, "\\u003c");
}

export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
