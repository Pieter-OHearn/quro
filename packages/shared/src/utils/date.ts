const ISO_DATE_LENGTH = 10;

/** `YYYY-MM-DD` (UTC) for a Date. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Today's `YYYY-MM-DD` on the caller's local calendar (browser/user time zone). */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a date-like value into `YYYY-MM-DD` (UTC); null when empty or invalid. */
export function toDateOnly(value: Date | string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : toIsoDate(parsed);
}

export function toUtcTimestamp(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

export function monthStartUtc(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function monthEndUtc(monthStart: number): number {
  const date = new Date(monthStart);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999);
}

export function addMonthsUtc(monthStart: number, months: number): number {
  const date = new Date(monthStart);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}
