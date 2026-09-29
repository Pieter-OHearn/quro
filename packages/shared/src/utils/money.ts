const CENTS_PER_UNIT = 100;

export function toCents(amount: number): number {
  // The epsilon nudge makes half-cent values such as 12.345 round up despite float error.
  return Math.round(amount * CENTS_PER_UNIT * (1 + Number.EPSILON));
}

export function fromCents(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

/** Rounds a monetary amount to whole cents (2 decimal places). */
export function roundMoney(amount: number): number {
  return fromCents(toCents(amount)) || 0;
}
