const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const ADMIN_TIME_ZONE = "Asia/Jerusalem";

const ADMIN_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ADMIN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const ADMIN_DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ADMIN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parseTimestamp(value: string) {
  // JavaScript supports milliseconds, while PostgreSQL may return microseconds.
  const normalizedValue = value.replace(/(\.\d{3})\d+(?=(?:Z|[+-]\d{2}:\d{2})$)/, "$1");
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function formatTimestamp(value: string, includeTime: boolean) {
  const date = parseTimestamp(value);
  if (!date) return null;

  const parts = (includeTime ? ADMIN_DATE_TIME_FORMAT : ADMIN_DATE_FORMAT).formatToParts(date);
  const formattedDate = `${partValue(parts, "day")}.${partValue(parts, "month")}.${partValue(parts, "year")}`;

  if (!includeTime) return formattedDate;

  return `${formattedDate}, ${partValue(parts, "hour")}:${partValue(parts, "minute")}`;
}

export function formatAdminDate(value: string) {
  const match = ISO_DATE.exec(value);
  if (match) {
    const [, year, month, day] = match;
    return `${day}.${month}.${year}`;
  }

  const dateTimeMatch = LOCAL_DATE_TIME.exec(value);
  if (dateTimeMatch) {
    const [, year, month, day] = dateTimeMatch;
    return `${day}.${month}.${year}`;
  }

  return formatTimestamp(value, false) ?? value;
}

export function formatAdminDateTime(value: string) {
  const match = LOCAL_DATE_TIME.exec(value);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${day}.${month}.${year}, ${hour}:${minute}`;
  }

  const dateMatch = ISO_DATE.exec(value);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return `${day}.${month}.${year}`;
  }

  return formatTimestamp(value, true) ?? value;
}
