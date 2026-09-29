const CENTS_PER_UNIT = 100;

export function toCents(amount: number): number {
  return Math.round(amount * CENTS_PER_UNIT);
}

export function fromCents(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

/** Rounds a monetary amount to whole cents (2 decimal places). */
export function roundMoney(amount: number): number {
  return fromCents(toCents(amount)) || 0;
}
