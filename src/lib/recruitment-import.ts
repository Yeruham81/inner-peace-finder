export const MAX_RECRUITMENT_CSV_BYTES = 256 * 1024;
export const MAX_RECRUITMENT_CSV_ROWS = 1000;

export type RecruitmentCsvRow = {
  rowNumber: number;
  email: string;
  normalizedEmail: string | null;
  firstName: string | null;
  lastName: string | null;
  parseStatus: "valid" | "invalid_email" | "duplicate_file";
};

export type ParsedRecruitmentCsv = {
  rows: RecruitmentCsvRow[];
  totalRows: number;
};

const EMAIL_HEADER_ALIASES = new Set(["email", "email_address", "email address", "e-mail", "אימייל", "דוא״ל", "דואל"]);
const FIRST_NAME_HEADER_ALIASES = new Set(["first_name", "firstname", "first name", "שם פרטי"]);
const LAST_NAME_HEADER_ALIASES = new Set(["last_name", "lastname", "last name", "שם משפחה"]);

export function normalizeRecruitmentEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 320) return null;
  // Intentionally conservative: enough to reject malformed imports without
  // pretending to implement the full RFC 5322 grammar.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) return null;
  return normalized;
}

export function normalizeRecruitmentPhone(value: string, defaultCountry = "IL"): string | null {
  // Phase 1 deliberately does not import phone destinations. This helper keeps
  // the public contract explicit for the future delivery phase without storing
  // phone numbers before the channel is implemented.
  void defaultCountry;
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!compact.startsWith("+")) return null;
  return /^\+[1-9][0-9]{7,14}$/.test(compact) ? compact : null;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function cleanOptionalName(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned.slice(0, 120);
}

function detectDelimiter(csvText: string): "," | ";" {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    if (char === '"') {
      if (inQuotes && csvText[index + 1] === '"') {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) break;
    if (!inQuotes && char === ",") commas += 1;
    if (!inQuotes && char === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

function parseCsvRecords(csvText: string, delimiter: "," | ";"): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new Error("קובץ ה-CSV מכיל שדה עם מרכאות שלא נסגרו.");

  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }

  return records;
}

function findHeaderIndex(headers: string[], aliases: Set<string>): number {
  return headers.findIndex((header) => aliases.has(header));
}

export function parseRecruitmentCsv(csvText: string): ParsedRecruitmentCsv {
  if (!csvText.trim()) throw new Error("קובץ ה-CSV ריק.");
  if (new TextEncoder().encode(csvText).byteLength > MAX_RECRUITMENT_CSV_BYTES) {
    throw new Error(`קובץ ה-CSV גדול מדי. הגודל המרבי הוא ${Math.floor(MAX_RECRUITMENT_CSV_BYTES / 1024)}KB.`);
  }

  const records = parseCsvRecords(csvText, detectDelimiter(csvText)).filter((record) => record.some((value) => value.trim() !== ""));
  if (records.length < 2) throw new Error("קובץ ה-CSV חייב לכלול שורת כותרות ולפחות רשומה אחת.");

  const headers = records[0].map(normalizeHeader);
  const emailIndex = findHeaderIndex(headers, EMAIL_HEADER_ALIASES);
  const firstNameIndex = findHeaderIndex(headers, FIRST_NAME_HEADER_ALIASES);
  const lastNameIndex = findHeaderIndex(headers, LAST_NAME_HEADER_ALIASES);

  if (emailIndex === -1) {
    throw new Error('לא נמצאה עמודת email בקובץ. השתמשו בכותרת "email" (או "אימייל").');
  }

  const dataRows = records.slice(1);
  if (dataRows.length > MAX_RECRUITMENT_CSV_ROWS) {
    throw new Error(`ניתן לייבא עד ${MAX_RECRUITMENT_CSV_ROWS} רשומות בקובץ אחד.`);
  }

  const seen = new Set<string>();
  const rows: RecruitmentCsvRow[] = dataRows.map((record, index) => {
    const email = record[emailIndex]?.trim() ?? "";
    const normalizedEmail = normalizeRecruitmentEmail(email);
    let parseStatus: RecruitmentCsvRow["parseStatus"] = "valid";

    if (!normalizedEmail) {
      parseStatus = "invalid_email";
    } else if (seen.has(normalizedEmail)) {
      parseStatus = "duplicate_file";
    } else {
      seen.add(normalizedEmail);
    }

    return {
      rowNumber: index + 2,
      email,
      normalizedEmail,
      firstName: cleanOptionalName(firstNameIndex >= 0 ? record[firstNameIndex] : undefined),
      lastName: cleanOptionalName(lastNameIndex >= 0 ? record[lastNameIndex] : undefined),
      parseStatus,
    };
  });

  return { rows, totalRows: rows.length };
}
