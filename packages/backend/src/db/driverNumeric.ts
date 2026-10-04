/** Converts a Postgres `numeric` string to a number, refusing values that would corrupt data. */
export function parseDriverNumeric(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Non-finite numeric value returned from the database: ${String(value)}`);
  }
  return parsed;
}
