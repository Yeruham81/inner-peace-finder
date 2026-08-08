/**
 * Canonical Israeli locality options for the therapist profile editor.
 *
 * Source: Israel Population and Immigration Authority / data.gov.il
 * Current datastore resource:
 *   5c78e9fa-c2e2-4771-93ff-7f400a12f7ba
 *
 * The official locality list is loaded server-side and cached in memory.
 * Tipulinks' eight product regions are derived from the official subdistrict
 * metadata, with explicit handling for the mixed Petah Tikva subdistrict.
 */

export const PRODUCT_REGIONS = [
  "צפון",
  "חיפה והקריות",
  "השרון",
  "תל אביב וגוש דן",
  "מרכז והשפלה",
  "ירושלים והסביבה",
  "יהודה ושומרון",
  "דרום",
] as const;

export type ProductRegion = (typeof PRODUCT_REGIONS)[number];

export type LocalityOption = {
  code: string;
  name: string;
  region: ProductRegion;
  subdistrict_code: string;
  subdistrict_name: string;
  regional_council: string | null;
};

const LOCALITIES_RESOURCE_ID = "5c78e9fa-c2e2-4771-93ff-7f400a12f7ba";
const LOCALITIES_URL =
  `https://data.gov.il/api/3/action/datastore_search?resource_id=${LOCALITIES_RESOURCE_ID}&limit=32000`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

let localityCache: { expiresAt: number; items: LocalityOption[] } | null = null;

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLocalityName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[׳’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function compactKey(value: string): string {
  return normalizeLocalityName(value)
    .replace(/["'()]/g, "")
    .replace(/[-\s]+/g, " ")
    .trim();
}

function getField(row: Record<string, unknown>, candidates: readonly string[]): string {
  for (const key of candidates) {
    const value = clean(row[key]);
    if (value) return value;
  }
  return "";
}

const PETAH_TIKVA_SHARON_LOCALITIES = new Set(
  [
    "ג'לג'וליה",
    "הוד השרון",
    "כוכב יאיר",
    "כוכב יאיר-צור יגאל",
    "כפר ברא",
    "כפר סבא",
    "כפר קאסם",
    "רעננה",
  ].map(compactKey),
);

const PETAH_TIKVA_GUSH_DAN_LOCALITIES = new Set(
  ["גבעת שמואל", "גני תקווה", "יהוד-מונוסון", "סביון", "פתח תקווה"].map(compactKey),
);

const PETAH_TIKVA_CENTER_LOCALITIES = new Set(["אלעד", "ראש העין"].map(compactKey));

function productRegionForPetahTikva(name: string, regionalCouncil: string): ProductRegion {
  const localityKey = compactKey(name);
  const councilKey = compactKey(regionalCouncil);

  // All localities in the South Sharon Regional Council belong to the
  // product's Sharon region, even though administratively they are in the
  // Petah Tikva subdistrict.
  if (councilKey === compactKey("דרום השרון")) return "השרון";
  if (PETAH_TIKVA_SHARON_LOCALITIES.has(localityKey)) return "השרון";
  if (PETAH_TIKVA_GUSH_DAN_LOCALITIES.has(localityKey)) return "תל אביב וגוש דן";
  if (PETAH_TIKVA_CENTER_LOCALITIES.has(localityKey)) return "מרכז והשפלה";

  // The remaining localities in this mixed subdistrict are geographically
  // closer to the Center bucket than to metropolitan Tel Aviv.
  return "מרכז והשפלה";
}

export function productRegionForLocality(input: {
  name: string;
  subdistrictCode: string;
  subdistrictName?: string;
  regionalCouncil?: string;
}): ProductRegion | null {
  const code = String(Number(clean(input.subdistrictCode)) || clean(input.subdistrictCode));
  const subdistrict = compactKey(input.subdistrictName ?? "");
  const council = input.regionalCouncil ?? "";

  if (["71", "72", "73", "74", "75", "76", "77"].includes(code)) return "יהודה ושומרון";

  switch (code) {
    case "11":
      return "ירושלים והסביבה";
    case "21":
    case "22":
    case "23":
    case "24":
    case "25":
    case "29":
      return "צפון";
    case "31":
      return "חיפה והקריות";
    case "32":
    case "41":
      return "השרון";
    case "42":
      return productRegionForPetahTikva(input.name, council);
    case "43":
    case "44":
      return "מרכז והשפלה";
    case "51":
    case "52":
    case "53":
      return "תל אביב וגוש דן";
    case "61":
    case "62":
      return "דרום";
  }

  // Defensive fallback for a future source that changes numeric codes but
  // keeps the official Hebrew subdistrict names.
  if (subdistrict === compactKey("ירושלים")) return "ירושלים והסביבה";
  if (["צפת", "כנרת", "עפולה", "עכו", "נצרת", "גולן"].map(compactKey).includes(subdistrict)) return "צפון";
  if (subdistrict === compactKey("חיפה")) return "חיפה והקריות";
  if (["חדרה", "השרון"].map(compactKey).includes(subdistrict)) return "השרון";
  if (subdistrict === compactKey("פתח תקווה")) return productRegionForPetahTikva(input.name, council);
  if (["רמלה", "רחובות"].map(compactKey).includes(subdistrict)) return "מרכז והשפלה";
  if (["תל אביב", "רמת גן", "חולון"].map(compactKey).includes(subdistrict)) return "תל אביב וגוש דן";
  if (["אשקלון", "באר שבע"].map(compactKey).includes(subdistrict)) return "דרום";
  if (
    ["ג'נין", "שכם", "טול כרם", "רמאללה", "ירדן יריחו", "בית לחם", "חברון"]
      .map(compactKey)
      .includes(subdistrict)
  ) {
    return "יהודה ושומרון";
  }

  return null;
}

function parseRecords(records: unknown[]): LocalityOption[] {
  const byName = new Map<string, LocalityOption>();

  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;

    const code = getField(row, ["סמל_ישוב", "סמל_יישוב", "Code", "code", "SETL_CODE"]);
    const name = getField(row, ["שם_ישוב", "שם_יישוב", "Name_Hebrew", "name_he", "SETL_NAME"]);
    const subdistrictCode = getField(row, ["סמל_נפה", "קוד_נפה", "Subdistrict_Code", "subdistrict_code"]);
    const subdistrictName = getField(row, ["שם_נפה", "נפה", "Subdistrict", "subdistrict_name"]);
    const regionalCouncil = getField(row, [
      "שם_מועצה",
      "שם_מועצה_אזורית",
      "שם_מועצה_איזורית",
      "Regional_Council",
      "regional_council",
    ]);

    if (!code || !name || !subdistrictCode) continue;

    const region = productRegionForLocality({
      name,
      subdistrictCode,
      subdistrictName,
      regionalCouncil,
    });
    if (!region) continue;

    const item: LocalityOption = {
      code,
      name: normalizeLocalityName(name),
      region,
      subdistrict_code: subdistrictCode,
      subdistrict_name: normalizeLocalityName(subdistrictName),
      regional_council: regionalCouncil ? normalizeLocalityName(regionalCouncil) : null,
    };

    byName.set(normalizeLocalityName(item.name), item);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export async function loadLocalityOptions(): Promise<LocalityOption[]> {
  const now = Date.now();
  if (localityCache && localityCache.expiresAt > now) return localityCache.items;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(LOCALITIES_URL, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`localities HTTP ${response.status}`);

    const payload = (await response.json()) as {
      success?: boolean;
      result?: { records?: unknown[] };
    };
    const records = payload.result?.records;
    if (!payload.success || !Array.isArray(records)) throw new Error("localities response is invalid");

    const items = parseRecords(records);
    // A low count strongly suggests a source/schema failure. Do not silently
    // treat a partial list as canonical.
    if (items.length < 500) throw new Error(`localities response contained only ${items.length} usable records`);

    localityCache = { expiresAt: now + CACHE_TTL_MS, items };
    return items;
  } catch (error) {
    // Stale-if-error: if this server process fetched a valid catalog earlier,
    // keep the editor usable during a temporary data.gov.il outage.
    if (localityCache?.items.length) return localityCache.items;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
