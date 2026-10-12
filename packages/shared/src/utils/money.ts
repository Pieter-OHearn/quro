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

/**
 * Sums money in integer cents: each amount is rounded to cents once, half away from zero, and the
 * cents are added exactly. Use it for every total of money, so a total always equals the sum of
 * the rounded amounts it is made of.
 */
export function sumMoney(amounts: Iterable<number>): number {
  let cents = 0;
  for (const amount of amounts) cents += toCents(amount);
  return fromCents(cents) || 0;
}
