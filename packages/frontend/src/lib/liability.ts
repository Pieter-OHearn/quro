const MINUS_SIGN = '−';

/**
 * A liability balance or an outgoing payment reads as a negative amount with a true minus sign,
 * in the plain figure colour; it is not a loss. Zero reads without a sign, and a negative input
 * (a credit) reads as a plain positive amount.
 */
export function formatAsNegative(fmt: (value: number) => string, amount: number): string {
  const magnitude = fmt(Math.abs(amount));
  return amount > 0 ? `${MINUS_SIGN}${magnitude}` : magnitude;
}
