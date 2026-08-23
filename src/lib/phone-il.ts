/**
 * Israeli phone-number parsing and normalization (pure, no I/O).
 *
 * Used by both the browser (soft validation) and the server (authoritative
 * validation). The server always re-validates; client-side checks are UX only.
 */
import parsePhoneNumberFromString from "libphonenumber-js";

export type NormalizedPhone = { ok: true; e164: string } | { ok: false; reason: PhoneRejection };

export type PhoneRejection = "empty" | "malformed" | "not_israeli" | "unsupported_type";

/**
 * Israeli prefixes we refuse to dial: premium-rate / paid services (1-900,
 * 1-901, 1-902…) and short service codes. Toll-free 1-800 is also excluded
 * because it is not a reachable personal destination for a bridged call.
 */
const BLOCKED_NATIONAL_PREFIXES = ["1700", "1800", "1900", "1901", "1902", "1919", "1599"];

/** Mobile and geographic landline area codes that may take a bridged call. */
const ALLOWED_AREA_PREFIXES = [
  "2",
  "3",
  "4",
  "8",
  "9",
  "50",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
  "59",
  "72",
  "73",
  "74",
  "76",
  "77",
  "78",
  "79",
];

/**
 * Accept the familiar local formats (050-123-4567, 0501234567, +972…,
 * 00972…, spaces/dashes/parentheses) and normalize to E.164. Only Israeli
 * destinations are permitted for either call leg at this stage.
 */
export function normalizeIsraeliPhone(input: string | null | undefined): NormalizedPhone {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  // Reject anything that is not plausible phone punctuation up front so that
  // e-mail-ish or script-ish input never reaches the parser.
  if (!/^[+\d\s\-().]+$/.test(raw)) return { ok: false, reason: "malformed" };

  const cleaned = raw.replace(/[\s\-().]/g, "").replace(/^00/, "+");
  const candidate = cleaned.startsWith("+") ? cleaned : cleaned.startsWith("972") ? `+${cleaned}` : cleaned;

  const parsed = parsePhoneNumberFromString(candidate, "IL");
  if (!parsed || !parsed.isValid()) return { ok: false, reason: "malformed" };
  if (parsed.country !== "IL" || parsed.countryCallingCode !== "972") {
    return { ok: false, reason: "not_israeli" };
  }

  const national = parsed.nationalNumber.toString();
  if (BLOCKED_NATIONAL_PREFIXES.some((prefix) => national.startsWith(prefix))) {
    return { ok: false, reason: "unsupported_type" };
  }
  if (!ALLOWED_AREA_PREFIXES.some((prefix) => national.startsWith(prefix))) {
    return { ok: false, reason: "unsupported_type" };
  }

  const e164 = parsed.number;
  if (!/^\+972\d{8,9}$/.test(e164)) return { ok: false, reason: "unsupported_type" };
  return { ok: true, e164 };
}

/** Lightweight client-side check; never authoritative. */
export function looksLikeIsraeliPhone(input: string): boolean {
  return normalizeIsraeliPhone(input).ok;
}
