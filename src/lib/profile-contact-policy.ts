export type ContactBypassType = "phone" | "email" | "website" | "social";

export type ContactPolicyField = {
  key: string;
  label: string;
  value: string | null | undefined;
};

export type ContactPolicyFinding = {
  fieldKey: string;
  fieldLabel: string;
  types: ContactBypassType[];
};

export type ContactPolicyScan = {
  findings: ContactPolicyFinding[];
  fieldKeys: string[];
  types: ContactBypassType[];
};

export type ProfileContactPolicyInput = {
  full_description?: string | null;
  education_training?: string | null;
  professional_experience?: string | null;
};

export const CONTACT_BYPASS_LABELS: Record<ContactBypassType, string> = {
  phone: "מספר טלפון",
  email: "כתובת אימייל",
  website: "כתובת אתר או קישור",
  social: "פרטי רשת חברתית או ערוץ תקשורת",
};

export const CONTACT_POLICY_SAVE_ERROR =
  "לא ניתן לשמור את הפרופיל משום שנמצאו בשדות הטקסט פרטי קשר ישירים או מוסווים. יש להסיר מספרי טלפון, כתובות אימייל, אתרים, קישורים או פרטי רשתות חברתיות. הוספת פרטי קשר כאלה מנוגדת לתנאי השימוש. ניסיונות כאלה נרשמים ועשויים להוביל להשעיה ולחסימת הפרופיל.";

const NUMBER_WORDS: Record<string, string> = {
  אפס: "0",
  אחד: "1",
  אחת: "1",
  שניים: "2",
  שתיים: "2",
  שתים: "2",
  שנים: "2",
  שלוש: "3",
  שלושה: "3",
  ארבע: "4",
  ארבעה: "4",
  חמש: "5",
  חמישה: "5",
  שש: "6",
  שישה: "6",
  שבע: "7",
  שבעה: "7",
  שמונה: "8",
  תשע: "9",
  תשעה: "9",
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const SPOKEN_NUMBER_WORDS = [
  ...Object.keys(NUMBER_WORDS),
  "עשר",
  "עשרה",
  "עשרים",
  "שלושים",
  "ארבעים",
  "חמישים",
  "שישים",
  "שבעים",
  "שמונים",
  "תשעים",
  "מאה",
  "מאות",
  "אלף",
  "אלפים",
  "ten",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
] as const;

const NUMBER_WORD_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(${Object.keys(NUMBER_WORDS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

const NUMBER_WORD_ALTERNATION = Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");
const CONCATENATED_NUMBER_WORDS_PATTERN = new RegExp(`(?:${NUMBER_WORD_ALTERNATION}){8,15}`, "giu");
const SINGLE_NUMBER_WORD_PATTERN = new RegExp(NUMBER_WORD_ALTERNATION, "giu");
const SPOKEN_NUMBER_WORD_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:ו)?(?:${[...SPOKEN_NUMBER_WORDS]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})(?![\p{L}\p{N}])`,
  "giu",
);
const PHONE_CONTEXT_PATTERN =
  /(טלפון|נייד|מספר\s*(?:ה)?טלפון|חייג|חייגו|וואטסאפ|ווטסאפ|whats\s*app|phone|mobile|call\s+me)/iu;

const EMAIL_PATTERN =
  /(?:[a-z0-9_%+\-]\s*){1,64}(?:\.\s*(?:[a-z0-9_%+\-]\s*)+)*@\s*(?:[a-z0-9-]\s*){1,63}(?:\.\s*(?:[a-z0-9-]\s*){2,63})+/giu;
const ISRAELI_PHONE_CANDIDATE_PATTERN = /(?:\+\s*9\s*7\s*2|0\s*0\s*9\s*7\s*2|9\s*7\s*2|0)(?:[\s().\-–—_/\\|]*\d){8,9}/g;
const PHONE_CANDIDATE_PATTERN = /(?:\+|00)?\s*(?:\d[\s().\-–—_/\\|]*){8,15}/g;
const DIRECT_URL_PATTERN = /(?:h\s*t\s*t\s*p\s*s?\s*:\s*\/\s*\/|w\s*w\s*w\s*\.)/iu;
const DOMAIN_PATTERN =
  /(?:[a-z0-9](?:\s*[a-z0-9-]){1,62})\s*\.\s*(?:c\s*o\s*\.\s*i\s*l|o\s*r\s*g\s*\.\s*i\s*l|a\s*c\s*\.\s*i\s*l|c\s*o\s*m|o\s*r\s*g|n\s*e\s*t|i\s*n\s*f\s*o|b\s*i\s*z|i\s*o|m\s*e|i\s*l|s\s*i\s*t\s*e|c\s*l\s*i\s*n\s*i\s*c|h\s*e\s*a\s*l\s*t\s*h|c\s*a\s*r\s*e|o\s*n\s*l\s*i\s*n\s*e|a\s*p\s*p|l\s*i\s*n\s*k|p\s*r\s*o|l\s*y)(?![a-z])/iu;
const SOCIAL_HANDLE_PATTERN = /(^|[^\p{L}\p{N}])@[a-z0-9][a-z0-9._-]{2,}/iu;
const SPACED_SOCIAL_HANDLE_PATTERN = /(^|[^\p{L}\p{N}])@\s*(?:[a-z0-9._-]\s*){3,}/iu;
const SOCIAL_PLATFORM_PATTERN =
  /(וואטסאפ|ווטסאפ|whats\s*app|telegram|טלגרם|instagram|אינסטגרם|facebook|פייסבוק|messenger|מסנג['׳’]?ר|linkedin|לינקדאין|tiktok|טיקטוק|signal|סיגנל|skype|סקייפ|viber|וייבר|discord|דיסקורד|twitter|טוויטר|wechat|ווי\s*צ['׳’]?אט|zoom|זום|google\s*meet)/iu;
const CONTACT_ACTION_PATTERN =
  /(צרו\s*קשר|צור\s*קשר|פנו\s*אל|פנה\s*אל|כתבו\s*לי|כתבו\s*אל|שלחו\s*לי|שלחו\s*הודעה|חפשו\s*אותי|מצאו\s*אותי|דברו\s*איתי|חייגו|dm\b|message\s+me|contact\s+me|reach\s+me)/iu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUnicodeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return String(code - 0x06f0);
  });
}

function normalizeBase(value: string): string {
  return normalizeUnicodeDigits(value.normalize("NFKC"))
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase();
}

function replaceNumberWords(value: string): string {
  return value.replace(NUMBER_WORD_PATTERN, (word) => NUMBER_WORDS[word.toLowerCase()] ?? word);
}

function deobfuscateAddressSeparators(value: string): string {
  return value
    .replace(
      /(?<![\p{L}\p{N}])(?:[([{}]\s*)?(?:ש\s*ט\s*ר\s*ו\s*ד\s*ל|כרוכית|a\s*t)(?:\s*[)\]}])?(?![\p{L}\p{N}])/giu,
      " @ ",
    )
    .replace(/(?<![\p{L}\p{N}])(?:[([{}]\s*)?(?:נ\s*ק\s*ו\s*ד\s*ה|d\s*o\s*t)(?:\s*[)\]}])?(?![\p{L}\p{N}])/giu, " . ")
    .replace(/(?<![\p{L}\p{N}])ב\s*[-־]?\s*ג\s*[׳'’]?\s*י\s*מ\s*י\s*י\s*ל(?![\p{L}\p{N}])/giu, " @ gmail.com ")
    .replace(/(?<![\p{L}\p{N}])ג\s*[׳'’]?\s*י\s*מ\s*י\s*י\s*ל(?![\p{L}\p{N}])/giu, " gmail.com ")
    .replace(/(?<![\p{L}\p{N}])ב\s*[-־]?\s*אאוטלוק(?![\p{L}\p{N}])/giu, " @ outlook.com ")
    .replace(/(?<![\p{L}\p{N}])אאוטלוק(?![\p{L}\p{N}])/giu, " outlook.com ")
    .replace(/(?<![\p{L}\p{N}])ב\s*[-־]?\s*יאהו(?![\p{L}\p{N}])/giu, " @ yahoo.com ")
    .replace(/(?<![\p{L}\p{N}])יאהו(?![\p{L}\p{N}])/giu, " yahoo.com ");
}

function looksLikePhoneDigits(rawDigits: string): boolean {
  let digits = rawDigits.replace(/^00/, "");
  if (digits.startsWith("972")) {
    digits = digits.slice(3);
    if (digits.startsWith("0")) digits = digits.slice(1);
    return /^[2-9]\d{7,8}$/.test(digits);
  }
  if (/^0[2-9]\d{7,8}$/.test(digits)) return true;
  if (/^5\d{8}$/.test(digits)) return true;
  return false;
}

function containsPhone(value: string): boolean {
  const expanded = replaceNumberWords(value);
  ISRAELI_PHONE_CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of expanded.matchAll(ISRAELI_PHONE_CANDIDATE_PATTERN)) {
    const digits = normalizeUnicodeDigits(match[0]).replace(/\D/g, "");
    if (looksLikePhoneDigits(digits)) return true;
  }

  PHONE_CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of expanded.matchAll(PHONE_CANDIDATE_PATTERN)) {
    const digits = normalizeUnicodeDigits(match[0]).replace(/\D/g, "");
    if (looksLikePhoneDigits(digits)) return true;
  }

  CONCATENATED_NUMBER_WORDS_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(CONCATENATED_NUMBER_WORDS_PATTERN)) {
    SINGLE_NUMBER_WORD_PATTERN.lastIndex = 0;
    const digits = [...match[0].matchAll(SINGLE_NUMBER_WORD_PATTERN)]
      .map((part) => NUMBER_WORDS[part[0].toLowerCase()] ?? "")
      .join("");
    if (looksLikePhoneDigits(digits)) return true;
  }

  SPOKEN_NUMBER_WORD_PATTERN.lastIndex = 0;
  const spokenNumberParts = [...value.matchAll(SPOKEN_NUMBER_WORD_PATTERN)];
  if (spokenNumberParts.length >= 6) return true;
  if (spokenNumberParts.length >= 3 && PHONE_CONTEXT_PATTERN.test(value)) return true;

  return false;
}

function emailRanges(value: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  EMAIL_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(EMAIL_PATTERN)) {
    if (match.index === undefined) continue;
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function blankRanges(value: string, ranges: Array<[number, number]>): string {
  if (!ranges.length) return value;
  const chars = value.split("");
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i += 1) chars[i] = " ";
  }
  return chars.join("");
}

function containsSocialContact(value: string): boolean {
  if (SOCIAL_HANDLE_PATTERN.test(value) || SPACED_SOCIAL_HANDLE_PATTERN.test(value)) return true;
  const platformMatch = SOCIAL_PLATFORM_PATTERN.exec(value);
  if (!platformMatch || platformMatch.index === undefined) return false;

  const start = Math.max(0, platformMatch.index - 120);
  const end = Math.min(value.length, platformMatch.index + platformMatch[0].length + 120);
  const nearby = value.slice(start, end);
  if (CONTACT_ACTION_PATTERN.test(nearby)) return true;

  const afterPlatform = value.slice(platformMatch.index + platformMatch[0].length, end);
  return /^\s*[:\-–—]\s*@?(?:[a-z0-9._-]\s*){3,}/iu.test(afterPlatform);
}

export function detectContactBypassTypes(input: string | null | undefined): ContactBypassType[] {
  const source = normalizeBase(input ?? "").trim();
  if (!source) return [];

  const deobfuscated = deobfuscateAddressSeparators(source);
  const emailMatches = emailRanges(deobfuscated);
  const types = new Set<ContactBypassType>();

  if (containsPhone(source)) types.add("phone");
  if (emailMatches.length > 0) types.add("email");

  const withoutEmails = blankRanges(deobfuscated, emailMatches);
  if (DIRECT_URL_PATTERN.test(withoutEmails) || DOMAIN_PATTERN.test(withoutEmails)) types.add("website");
  if (containsSocialContact(withoutEmails)) types.add("social");

  return [...types];
}

export function scanContactPolicyFields(fields: readonly ContactPolicyField[]): ContactPolicyScan {
  const findings = fields
    .map((field) => ({
      fieldKey: field.key,
      fieldLabel: field.label,
      types: detectContactBypassTypes(field.value),
    }))
    .filter((finding) => finding.types.length > 0);

  return {
    findings,
    fieldKeys: [...new Set(findings.map((finding) => finding.fieldKey))],
    types: [...new Set(findings.flatMap((finding) => finding.types))],
  };
}

export function scanProfileContactPolicy(input: ProfileContactPolicyInput): ContactPolicyScan {
  // Deliberately limited to the three narrative profile fields. Address/location
  // fields are excluded because legitimate street and house numbers can look
  // like obfuscated contact details and create false positives.
  return scanContactPolicyFields([
    { key: "full_description", label: "קצת עליי", value: input.full_description },
    { key: "education_training", label: "השכלה והכשרה", value: input.education_training },
    { key: "professional_experience", label: "ניסיון מקצועי", value: input.professional_experience },
  ]);
}

export function contactPolicyWarningText(types: readonly ContactBypassType[]): string {
  const labels = [...new Set(types)].map((type) => CONTACT_BYPASS_LABELS[type]);
  const detectedTypes = labels.length > 0 ? ` (${labels.join(", ")})` : "";
  return `נמצאו פרטי קשר ישירים או מוסווים${detectedTypes} המפרים את תנאי השימוש. יש להסיר אותם ולהשתמש בדרכי ההתקשרות המובנות של טיפולינקס. ניסיונות חוזרים נרשמים ועשויים להוביל להשעיה ולחסימת הפרופיל.`;
}
