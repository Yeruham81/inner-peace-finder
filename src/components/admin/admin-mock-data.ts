// Mock data for the admin UI only. No production data access.
// Replace these arrays with real admin queries later; the screens read them through props.

export type ProfileStatus = "פורסם" | "טיוטה" | "ממתין" | "מוקפא";
export type AccountStatus = "פעיל" | "ממתין" | "מוקפא";
export type VerificationStatus = "מאומת" | "ממתין לאימות" | "ללא אימות";

export type MockTherapist = {
  id: string;
  name: string;
  title: string;
  profession: string;
  profileStatus: ProfileStatus;
  accountStatus: AccountStatus;
  verificationStatus: VerificationStatus;
  joinedAt: string;
  lastActiveAt: string;
  city: string;
  email: string;
  phone: string;
  domains: string[];
  credentials: { type: string; authority: string; status: VerificationStatus }[];
};

export const MOCK_THERAPISTS: MockTherapist[] = [
  {
    id: "TH-1041",
    name: "נועה בר-אילן",
    title: "פסיכולוגית קלינית",
    profession: "פסיכולוגיה קלינית",
    profileStatus: "פורסם",
    accountStatus: "פעיל",
    verificationStatus: "מאומת",
    joinedAt: "2026-02-14",
    lastActiveAt: "2026-08-17",
    city: "תל אביב",
    email: "noa.mock@example.com",
    phone: "050-0000001",
    domains: ["חרדה", "דיכאון", "טראומה"],
    credentials: [{ type: "רישיון פסיכולוג", authority: "משרד הבריאות", status: "מאומת" }],
  },
  {
    id: "TH-1042",
    name: "יובל אשכנזי",
    title: "עובד סוציאלי קליני",
    profession: "עבודה סוציאלית",
    profileStatus: "ממתין",
    accountStatus: "ממתין",
    verificationStatus: "ממתין לאימות",
    joinedAt: "2026-05-03",
    lastActiveAt: "2026-08-18",
    city: "חיפה",
    email: "yuval.mock@example.com",
    phone: "050-0000002",
    domains: ["זוגיות", "חרדה"],
    credentials: [{ type: "תעודת עו״ס קליני", authority: "משרד העבודה", status: "ממתין לאימות" }],
  },
  {
    id: "TH-1043",
    name: "מיכל דגן",
    title: "פסיכותרפיסטית",
    profession: "פסיכותרפיה",
    profileStatus: "טיוטה",
    accountStatus: "פעיל",
    verificationStatus: "ללא אימות",
    joinedAt: "2026-06-21",
    lastActiveAt: "2026-08-11",
    city: "ירושלים",
    email: "michal.mock@example.com",
    phone: "050-0000003",
    domains: ["הורות", "משפחה"],
    credentials: [],
  },
  {
    id: "TH-1044",
    name: "איתי שקד",
    title: "פסיכיאטר",
    profession: "פסיכיאטריה",
    profileStatus: "פורסם",
    accountStatus: "פעיל",
    verificationStatus: "מאומת",
    joinedAt: "2025-11-09",
    lastActiveAt: "2026-08-18",
    city: "רמת גן",
    email: "itay.mock@example.com",
    phone: "050-0000004",
    domains: ["דיכאון", "הפרעות קשב"],
    credentials: [{ type: "רישיון רופא מומחה", authority: "משרד הבריאות", status: "מאומת" }],
  },
  {
    id: "TH-1045",
    name: "שירה כהן-לוי",
    title: "מטפלת באמנות",
    profession: "טיפול באמנות",
    profileStatus: "מוקפא",
    accountStatus: "מוקפא",
    verificationStatus: "ממתין לאימות",
    joinedAt: "2026-01-27",
    lastActiveAt: "2026-07-02",
    city: "באר שבע",
    email: "shira.mock@example.com",
    phone: "050-0000005",
    domains: ["ילדים", "טראומה"],
    credentials: [{ type: "תעודת מטפלת באמנות", authority: "יה״ת", status: "ממתין לאימות" }],
  },
  {
    id: "TH-1046",
    name: "עומר פרידמן",
    title: "פסיכולוג חינוכי",
    profession: "פסיכולוגיה חינוכית",
    profileStatus: "פורסם",
    accountStatus: "פעיל",
    verificationStatus: "מאומת",
    joinedAt: "2026-03-18",
    lastActiveAt: "2026-08-16",
    city: "נתניה",
    email: "omer.mock@example.com",
    phone: "050-0000006",
    domains: ["מתבגרים", "קשיי למידה"],
    credentials: [{ type: "רישיון פסיכולוג", authority: "משרד הבריאות", status: "מאומת" }],
  },
  {
    id: "TH-1047",
    name: "רותם אלמוג",
    title: "מטפלת CBT",
    profession: "פסיכותרפיה",
    profileStatus: "ממתין",
    accountStatus: "ממתין",
    verificationStatus: "ללא אימות",
    joinedAt: "2026-07-30",
    lastActiveAt: "2026-08-15",
    city: "מודיעין",
    email: "rotem.mock@example.com",
    phone: "050-0000007",
    domains: ["OCD", "חרדה חברתית"],
    credentials: [],
  },
];

export type CredentialStatus = "ממתין לבדיקה" | "מאומת" | "נדחה";

export type MockCredentialRequest = {
  id: string;
  therapistName: string;
  credentialType: string;
  profession: string;
  authority: string;
  licenseNumber: string;
  submittedAt: string;
  status: CredentialStatus;
  documentName: string;
  rejectionReason?: string;
};

export const MOCK_CREDENTIAL_REQUESTS: MockCredentialRequest[] = [
  {
    id: "CR-2201",
    therapistName: "יובל אשכנזי",
    credentialType: "תעודת עו״ס קליני",
    profession: "עבודה סוציאלית",
    authority: "משרד העבודה",
    licenseNumber: "SW-88213",
    submittedAt: "2026-08-16",
    status: "ממתין לבדיקה",
    documentName: "license-mock.pdf",
  },
  {
    id: "CR-2202",
    therapistName: "שירה כהן-לוי",
    credentialType: "תעודת מטפלת באמנות",
    profession: "טיפול באמנות",
    authority: "יה״ת",
    licenseNumber: "AT-40127",
    submittedAt: "2026-08-14",
    status: "ממתין לבדיקה",
    documentName: "certificate-mock.jpg",
  },
  {
    id: "CR-2203",
    therapistName: "רותם אלמוג",
    credentialType: "תעודת הכשרה CBT",
    profession: "פסיכותרפיה",
    authority: "מכון להכשרה קלינית",
    licenseNumber: "CBT-1180",
    submittedAt: "2026-08-11",
    status: "ממתין לבדיקה",
    documentName: "training-mock.pdf",
  },
  {
    id: "CR-2204",
    therapistName: "נועה בר-אילן",
    credentialType: "רישיון פסיכולוג",
    profession: "פסיכולוגיה קלינית",
    authority: "משרד הבריאות",
    licenseNumber: "PSY-27-4410",
    submittedAt: "2026-07-28",
    status: "מאומת",
    documentName: "license-mock.pdf",
  },
  {
    id: "CR-2205",
    therapistName: "מיכל דגן",
    credentialType: "תעודת פסיכותרפיה",
    profession: "פסיכותרפיה",
    authority: "מכון פרטי",
    licenseNumber: "PT-9931",
    submittedAt: "2026-07-19",
    status: "נדחה",
    documentName: "certificate-mock.png",
    rejectionReason: "המסמך לא קריא — נדרש סריקה חדשה.",
  },
];

export type LeadChannel = "WhatsApp" | "טלפון" | "אימייל";
export type LeadStatus = "נוצרה" | "נמסרה" | "נענתה" | "נכשלה";

export type MockLead = {
  id: string;
  createdAt: string;
  therapistName: string;
  channel: LeadChannel;
  source: string;
  status: LeadStatus;
  history: { label: string; at: string }[];
};

export const MOCK_LEADS: MockLead[] = [
  {
    id: "LD-77301",
    createdAt: "2026-08-18 21:40",
    therapistName: "נועה בר-אילן",
    channel: "WhatsApp",
    source: "חיפוש אורגני",
    status: "נענתה",
    history: [
      { label: "נוצרה", at: "21:40" },
      { label: "נמסרה", at: "21:41" },
      { label: "נענתה", at: "22:05" },
    ],
  },
  {
    id: "LD-77298",
    createdAt: "2026-08-18 18:12",
    therapistName: "איתי שקד",
    channel: "טלפון",
    source: "עמוד פרופיל",
    status: "נמסרה",
    history: [
      { label: "נוצרה", at: "18:12" },
      { label: "נמסרה", at: "18:12" },
    ],
  },
  {
    id: "LD-77291",
    createdAt: "2026-08-17 09:55",
    therapistName: "עומר פרידמן",
    channel: "אימייל",
    source: "חיפוש פנימי",
    status: "נוצרה",
    history: [{ label: "נוצרה", at: "09:55" }],
  },
  {
    id: "LD-77284",
    createdAt: "2026-08-15 14:03",
    therapistName: "מיכל דגן",
    channel: "WhatsApp",
    source: "קמפיין",
    status: "נכשלה",
    history: [
      { label: "נוצרה", at: "14:03" },
      { label: "נכשלה", at: "14:04" },
    ],
  },
  {
    id: "LD-77270",
    createdAt: "2026-08-12 11:20",
    therapistName: "נועה בר-אילן",
    channel: "אימייל",
    source: "הפניה",
    status: "נענתה",
    history: [
      { label: "נוצרה", at: "11:20" },
      { label: "נמסרה", at: "11:21" },
      { label: "נענתה", at: "12:40" },
    ],
  },
  {
    id: "LD-77255",
    createdAt: "2026-07-30 16:47",
    therapistName: "רותם אלמוג",
    channel: "טלפון",
    source: "חיפוש אורגני",
    status: "נמסרה",
    history: [
      { label: "נוצרה", at: "16:47" },
      { label: "נמסרה", at: "16:47" },
    ],
  },
];

export type ClaimStatus = "ממתין" | "אושר" | "נדחה";

export type MockClaim = {
  id: string;
  applicantName: string;
  requestedProfile: string;
  email: string;
  phone: string;
  requestedAt: string;
  status: ClaimStatus;
  supportingInfo: string;
  rejectionReason?: string;
};

export const MOCK_CLAIMS: MockClaim[] = [
  {
    id: "CL-501",
    applicantName: "דנה מזרחי",
    requestedProfile: "דנה מזרחי — פסיכותרפיה",
    email: "dana.mock@example.com",
    phone: "050-0000011",
    requestedAt: "2026-08-17",
    status: "ממתין",
    supportingInfo: "צילום תעודה מקצועית וקישור לאתר קליניקה (הדגמה).",
  },
  {
    id: "CL-502",
    applicantName: "אורי בן-חיים",
    requestedProfile: "אורי בן-חיים — עבודה סוציאלית",
    email: "uri.mock@example.com",
    phone: "050-0000012",
    requestedAt: "2026-08-15",
    status: "ממתין",
    supportingInfo: "אימות כתובת אימייל ארגונית (הדגמה).",
  },
  {
    id: "CL-503",
    applicantName: "טל רוזן",
    requestedProfile: "טל רוזן — פסיכולוגיה חינוכית",
    email: "tal.mock@example.com",
    phone: "050-0000013",
    requestedAt: "2026-08-06",
    status: "אושר",
    supportingInfo: "אומת מול מספר רישיון (הדגמה).",
  },
  {
    id: "CL-504",
    applicantName: "רון סלע",
    requestedProfile: "ר. סלע — טיפול משפחתי",
    email: "ron.mock@example.com",
    phone: "050-0000014",
    requestedAt: "2026-07-24",
    status: "נדחה",
    supportingInfo: "חוסר התאמה בין הפרטים לפרופיל (הדגמה).",
    rejectionReason: "לא הוצגה הוכחת זהות מתאימה.",
  },
];

export type MockCatalogItem = {
  name: string;
  slug: string;
  active: boolean;
  order: number;
};

export type MockCatalog = {
  key: string;
  label: string;
  total: number;
  active: number;
  inactive: number;
  updatedAt: string;
  items: MockCatalogItem[];
};

export const MOCK_CATALOGS: MockCatalog[] = [
  {
    key: "professions",
    label: "מקצועות",
    total: 12,
    active: 11,
    inactive: 1,
    updatedAt: "2026-08-10",
    items: [
      { name: "פסיכולוגיה קלינית", slug: "clinical-psychology", active: true, order: 1 },
      { name: "עבודה סוציאלית", slug: "social-work", active: true, order: 2 },
      { name: "פסיכיאטריה", slug: "psychiatry", active: true, order: 3 },
      { name: "ייעוץ חינוכי", slug: "educational-counseling", active: false, order: 4 },
    ],
  },
  {
    key: "domains",
    label: "תחומי טיפול",
    total: 86,
    active: 79,
    inactive: 7,
    updatedAt: "2026-08-16",
    items: [
      { name: "חרדה", slug: "anxiety", active: true, order: 1 },
      { name: "דיכאון", slug: "depression", active: true, order: 2 },
      { name: "טראומה מינית", slug: "sexual-abuse-trauma", active: true, order: 3 },
      { name: "הפרעות אישיות", slug: "personality-disorders", active: false, order: 4 },
    ],
  },
  {
    key: "populations",
    label: "אוכלוסיות",
    total: 18,
    active: 16,
    inactive: 2,
    updatedAt: "2026-08-02",
    items: [
      { name: "ילדים", slug: "children", active: true, order: 1 },
      { name: "מתבגרים", slug: "teens", active: true, order: 2 },
      { name: "זוגות", slug: "couples", active: true, order: 3 },
      { name: "גימלאים", slug: "seniors", active: false, order: 4 },
    ],
  },
  {
    key: "modalities",
    label: "גישות ושיטות טיפוליות",
    total: 24,
    active: 22,
    inactive: 2,
    updatedAt: "2026-07-29",
    items: [
      { name: "CBT", slug: "cbt", active: true, order: 1 },
      { name: "פסיכודינמי", slug: "psychodynamic", active: true, order: 2 },
      { name: "EMDR", slug: "emdr", active: true, order: 3 },
      { name: "ACT", slug: "act", active: false, order: 4 },
    ],
  },
  {
    key: "languages",
    label: "שפות",
    total: 9,
    active: 9,
    inactive: 0,
    updatedAt: "2026-06-11",
    items: [
      { name: "עברית", slug: "he", active: true, order: 1 },
      { name: "אנגלית", slug: "en", active: true, order: 2 },
      { name: "רוסית", slug: "ru", active: true, order: 3 },
      { name: "ערבית", slug: "ar", active: true, order: 4 },
    ],
  },
  {
    key: "locations",
    label: "אזורים / מיקומים",
    total: 42,
    active: 40,
    inactive: 2,
    updatedAt: "2026-08-13",
    items: [
      { name: "תל אביב", slug: "tel-aviv", active: true, order: 1 },
      { name: "ירושלים", slug: "jerusalem", active: true, order: 2 },
      { name: "חיפה", slug: "haifa", active: true, order: 3 },
      { name: "אילת", slug: "eilat", active: false, order: 4 },
    ],
  },
];

export type MockTransaction = {
  id: string;
  date: string;
  therapistName: string;
  kind: string;
  amount: string;
  status: "שולם" | "ממתין" | "נכשל";
};

export const MOCK_TRANSACTIONS: MockTransaction[] = [
  { id: "TX-9001", date: "2026-08-18", therapistName: "נועה בר-אילן", kind: "חיוב ליד", amount: "₪38", status: "שולם" },
  { id: "TX-9002", date: "2026-08-17", therapistName: "איתי שקד", kind: "מנוי חודשי", amount: "₪149", status: "שולם" },
  { id: "TX-9003", date: "2026-08-16", therapistName: "עומר פרידמן", kind: "חיוב ליד", amount: "₪38", status: "ממתין" },
  { id: "TX-9004", date: "2026-08-12", therapistName: "מיכל דגן", kind: "חבילת קרדיטים", amount: "₪450", status: "שולם" },
  { id: "TX-9005", date: "2026-08-05", therapistName: "רותם אלמוג", kind: "חיוב ליד", amount: "₪38", status: "נכשל" },
];

export const MOCK_PRICE_LIST = [
  { name: "ליד WhatsApp", price: "₪38", note: "נתוני הדגמה" },
  { name: "ליד טלפוני", price: "₪42", note: "נתוני הדגמה" },
  { name: "ליד אימייל", price: "₪28", note: "נתוני הדגמה" },
  { name: "מנוי חודשי בסיסי", price: "₪149", note: "נתוני הדגמה" },
];

export const MOCK_CREDITS = [
  { therapistName: "נועה בר-אילן", balance: "₪320", updatedAt: "2026-08-18" },
  { therapistName: "איתי שקד", balance: "₪95", updatedAt: "2026-08-17" },
  { therapistName: "מיכל דגן", balance: "₪450", updatedAt: "2026-08-12" },
];

export const MOCK_INVOICES = [
  { id: "INV-3301", date: "2026-08-01", therapistName: "נועה בר-אילן", amount: "₪187", status: "הופקה" },
  { id: "INV-3302", date: "2026-08-01", therapistName: "איתי שקד", amount: "₪149", status: "הופקה" },
  { id: "INV-3303", date: "2026-07-01", therapistName: "עומר פרידמן", amount: "₪76", status: "הופקה" },
];
