export const ACCOUNT_MOCK_SUMMARY = {
  impressions: 1284,
  profileViews: 176,
  leads: 21,
  charges: 168,
  uniqueViews: 141,
};

export const ACCOUNT_MOCK_DAILY = [
  { day: "1", impressions: 34, views: 4, leads: 0 },
  { day: "3", impressions: 52, views: 8, leads: 1 },
  { day: "5", impressions: 38, views: 5, leads: 1 },
  { day: "7", impressions: 61, views: 11, leads: 2 },
  { day: "9", impressions: 44, views: 6, leads: 0 },
  { day: "11", impressions: 58, views: 9, leads: 1 },
  { day: "13", impressions: 67, views: 12, leads: 2 },
  { day: "15", impressions: 55, views: 8, leads: 1 },
  { day: "17", impressions: 73, views: 10, leads: 2 },
  { day: "19", impressions: 62, views: 9, leads: 1 },
  { day: "21", impressions: 77, views: 13, leads: 2 },
  { day: "23", impressions: 70, views: 10, leads: 1 },
  { day: "25", impressions: 81, views: 14, leads: 2 },
  { day: "27", impressions: 68, views: 9, leads: 1 },
  { day: "30", impressions: 84, views: 15, leads: 3 },
];

export type MockLead = {
  id: string;
  date: string;
  time: string;
  channel: "WhatsApp" | "טלפון" | "אימייל";
  status: "נמסרה" | "שיחה נענתה" | "ממתינה";
  charge: number;
};

export const ACCOUNT_MOCK_LEADS: MockLead[] = [
  { id: "L-1042", date: "18.08.26", time: "18:42", channel: "WhatsApp", status: "נמסרה", charge: 8 },
  { id: "L-1041", date: "17.08.26", time: "12:15", channel: "טלפון", status: "שיחה נענתה", charge: 12 },
  { id: "L-1039", date: "15.08.26", time: "09:31", channel: "אימייל", status: "נמסרה", charge: 8 },
  { id: "L-1038", date: "13.08.26", time: "20:04", channel: "WhatsApp", status: "נמסרה", charge: 8 },
  { id: "L-1035", date: "10.08.26", time: "16:27", channel: "טלפון", status: "שיחה נענתה", charge: 12 },
  { id: "L-1032", date: "08.08.26", time: "11:03", channel: "אימייל", status: "ממתינה", charge: 0 },
];

export const ACCOUNT_MOCK_CHANNELS = [
  { channel: "WhatsApp", count: 12, share: 57 },
  { channel: "טלפון", count: 6, share: 29 },
  { channel: "אימייל", count: 3, share: 14 },
];

export type MockTransaction = {
  id: string;
  date: string;
  description: string;
  type: "חיוב" | "זיכוי";
  amount: number;
};

export const ACCOUNT_MOCK_TRANSACTIONS: MockTransaction[] = [
  { id: "TX-2081", date: "18.08.26", description: "פנייה ב-WhatsApp · L-1042", type: "חיוב", amount: 8 },
  { id: "TX-2077", date: "17.08.26", description: "שיחת טלפון שנענתה · L-1041", type: "חיוב", amount: 12 },
  { id: "TX-2068", date: "15.08.26", description: "פנייה באימייל · L-1039", type: "חיוב", amount: 8 },
  { id: "TX-2059", date: "13.08.26", description: "פנייה ב-WhatsApp · L-1038", type: "חיוב", amount: 8 },
  { id: "TX-2040", date: "11.08.26", description: "זיכוי עבור פנייה כפולה", type: "זיכוי", amount: -8 },
];
