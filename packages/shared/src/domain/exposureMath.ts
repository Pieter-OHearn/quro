const PERCENT = 100;
const PERCENT_PRECISION = 100;

/** A part of a total as a percentage, rounded to two decimals once. */
export function roundPercent(cents: number, totalCents: number): number {
  return Math.round((cents / totalCents) * PERCENT * PERCENT_PRECISION) / PERCENT_PRECISION;
}
