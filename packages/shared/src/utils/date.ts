const ISO_DATE_LENGTH = 10;

/** `YYYY-MM-DD` (UTC) for a Date. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, ISO_DATE_LENGTH);
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
