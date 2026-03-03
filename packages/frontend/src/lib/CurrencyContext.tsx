import { createContext, useContext, useState, ReactNode } from 'react';
import { CURRENCY_CODES, CURRENCY_META, type CurrencyCode } from '@quro/shared';

export { CURRENCY_CODES, CURRENCY_META };
export type { CurrencyCode };

/**
 * Rates expressed as: 1 unit of this currency = X EUR
 * To convert amount from currency A to base currency B:
 *   amountInEUR = amount * RATES_TO_EUR[A]
 *   amountInBase = amountInEUR / RATES_TO_EUR[B]
 * Approximate rates as of early 2026.
 */
export const RATES_TO_EUR: Record<CurrencyCode, number> = {
  EUR: 1.0,
  GBP: 1.18,
  USD: 0.922,
  AUD: 0.6,
  NZD: 0.551,
  CAD: 0.66,
  CHF: 1.046,
  SGD: 0.68,
};

// ─── Context ──────────────────────────────────────────────────────────────────

type CurrencyContextType = {
  baseCurrency: CurrencyCode;
  setBaseCurrency: (c: CurrencyCode) => void;
  /** Convert an amount from any currency into the base currency */
  convertToBase: (amount: number, fromCurrency: string) => number;
  /** Format an amount (already in `fromCurrency`) displayed in the base currency */
  fmtBase: (amount: number, fromCurrency?: string, decimals?: boolean) => string;
  /** Format an amount in its own native currency */
  fmtNative: (amount: number, currency: string, decimals?: boolean) => string;
  /** True when fromCurrency ≠ baseCurrency */
  isForeign: (currency: string) => boolean;
};

const CurrencyContext = createContext<CurrencyContextType | null>(null);
const CURRENCY_SET = new Set<CurrencyCode>(CURRENCY_CODES);

function normalizeCurrency(currency: string): CurrencyCode {
  if (CURRENCY_SET.has(currency as CurrencyCode)) return currency as CurrencyCode;
  return 'EUR';
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>('EUR');

  const convertToBase = (amount: number, fromCurrency: string): number => {
    const safeCurrency = normalizeCurrency(fromCurrency);
    const amountInEUR = amount * RATES_TO_EUR[safeCurrency];
    return amountInEUR / RATES_TO_EUR[baseCurrency];
  };

  const fmtCurrency = (amount: number, currency: string, decimals = false): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizeCurrency(currency),
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    }).format(amount);

  const fmtBase = (amount: number, fromCurrency?: string, decimals = false): string => {
    const converted = fromCurrency ? convertToBase(amount, fromCurrency) : amount;
    return fmtCurrency(converted, baseCurrency, decimals);
  };

  const fmtNative = (amount: number, currency: string, decimals = false): string =>
    fmtCurrency(amount, currency, decimals);

  const isForeign = (currency: string) => normalizeCurrency(currency) !== baseCurrency;

  return (
    <CurrencyContext.Provider
      value={{ baseCurrency, setBaseCurrency, convertToBase, fmtBase, fmtNative, isForeign }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
