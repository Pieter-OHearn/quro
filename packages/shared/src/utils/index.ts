export function formatCurrency(amount: number, currency: string, decimals = true): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(amount);
}

export const RATES_TO_EUR: Record<string, number> = {
  EUR: 1.0,
  GBP: 1.18,
  USD: 0.922,
  AUD: 0.6,
  NZD: 0.551,
  CAD: 0.66,
  CHF: 1.046,
  SGD: 0.68,
};
