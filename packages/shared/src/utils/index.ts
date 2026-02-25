export function formatCurrency(amount: number, currency: string, decimals = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(amount);
}

export const RATES_TO_EUR: Record<string, number> = {
  EUR: 1.000,
  GBP: 1.180,
  USD: 0.922,
  AUD: 0.600,
  NZD: 0.551,
  CAD: 0.660,
  CHF: 1.046,
  SGD: 0.680,
};
