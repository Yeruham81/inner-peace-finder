const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;

export function formatAdminDate(value: string) {
  const match = ISO_DATE.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}

export function formatAdminDateTime(value: string) {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return value;

  const [, year, month, day, hour, minute] = match;
  return `${day}.${month}.${year}, ${hour}:${minute}`;
}
