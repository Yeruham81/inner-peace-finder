import type { AccountActivityChannel } from "./account-activity.functions";

export function formatAccountActivityDate(value: string): { date: string; time: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—" };
  return {
    date: new Intl.DateTimeFormat("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "Asia/Jerusalem",
    }).format(date),
    time: new Intl.DateTimeFormat("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Jerusalem",
    }).format(date),
  };
}

export function formatChartDay(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatAgorot(agorot: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(agorot / 100);
}

export function accountChannelLabel(channel: AccountActivityChannel): string {
  switch (channel) {
    case "whatsapp":
      return "WhatsApp";
    case "phone":
      return "טלפון";
    case "email":
      return "אימייל";
    default:
      return "ערוץ אחר";
  }
}

export function accountLeadStatusLabel(status: string, channel: AccountActivityChannel): string {
  if (channel === "phone" && (status === "connected" || status === "answered")) return "שיחה נענתה";
  switch (status) {
    case "sent":
      return "נשלחה";
    case "pending":
      return "ממתינה לשליחה";
    case "failed":
      return "השליחה נכשלה";
    case "awaiting_consent":
      return "ממתינה לאישור המטפל/ת";
    case "expired_before_consent":
      return "פג תוקף לפני אישור";
    case "cancelled_after_opt_out":
      return "בוטלה";
    default:
      return status || "ממתינה";
  }
}

export function percentageChange(current: number, previous: number): number | undefined {
  if (previous === 0) return current === 0 ? undefined : 100;
  return Math.round(((current - previous) / previous) * 100);
}

export function shortActivityId(id: string, prefix: "L" | "TX"): string {
  const compact = id.replaceAll("-", "").slice(-6).toUpperCase();
  return compact ? `${prefix}-${compact}` : "—";
}
