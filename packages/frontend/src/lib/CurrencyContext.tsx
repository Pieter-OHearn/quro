import { createContext, useContext, useState, ReactNode } from "react";

export type CurrencyCode = "EUR" | "GBP" | "USD" | "AUD" | "NZD" | "CAD" | "CHF" | "SGD";

export const CURRENCY_META: Record<CurrencyCode, { symbol: string; name: string; flag: string }> = {
  EUR: { symbol: "€",    name: "Euro",                flag: "🇪🇺" },
  GBP: { symbol: "£",    name: "British Pound",       flag: "🇬🇧" },
  USD: { symbol: "$",    name: "US Dollar",           flag: "🇺🇸" },
  AUD: { symbol: "A$",   name: "Australian Dollar",   flag: "🇦🇺" },
  NZD: { symbol: "NZ$",  name: "New Zealand Dollar",  flag: "🇳🇿" },
  CAD: { symbol: "CA$",  name: "Canadian Dollar",     flag: "🇨🇦" },
  CHF: { symbol: "CHF",  name: "Swiss Franc",         flag: "🇨🇭" },
  SGD: { symbol: "S$",   name: "Singapore Dollar",    flag: "🇸🇬" },
};

/**
 * Rates expressed as: 1 unit of this currency = X EUR
 * To convert amount from currency A to base currency B:
 *   amountInEUR = amount * RATES_TO_EUR[A]
 *   amountInBase = amountInEUR / RATES_TO_EUR[B]
 * Approximate rates as of early 2026.
 */
export const RATES_TO_EUR: Record<CurrencyCode, number> = {
  EUR: 1.000,
  GBP: 1.180,
  USD: 0.922,
  AUD: 0.600,
  NZD: 0.551,
  CAD: 0.660,
  CHF: 1.046,
  SGD: 0.680,
};

export const CURRENCY_LIST = Object.keys(CURRENCY_META) as CurrencyCode[];

// ─── Context ──────────────────────────────────────────────────────────────────

type CurrencyContextType = {
  baseCurrency: CurrencyCode;
  setBaseCurrency: (c: CurrencyCode) => void;
  /** Convert an amount from any currency into the base currency */
  convertToBase: (amount: number, fromCurrency: CurrencyCode) => number;
  /** Format an amount (already in `fromCurrency`) displayed in the base currency */
  fmtBase: (amount: number, fromCurrency?: CurrencyCode, decimals?: boolean) => string;
  /** Format an amount in its own native currency */
  fmtNative: (amount: number, currency: CurrencyCode, decimals?: boolean) => string;
  /** True when fromCurrency ≠ baseCurrency */
  isForeign: (currency: CurrencyCode) => boolean;
};

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>("EUR");

  const convertToBase = (amount: number, fromCurrency: CurrencyCode): number => {
    const amountInEUR = amount * RATES_TO_EUR[fromCurrency];
    return amountInEUR / RATES_TO_EUR[baseCurrency];
  };

  const fmtCurrency = (amount: number, currency: CurrencyCode, decimals = false): string =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    }).format(amount);

  const fmtBase = (amount: number, fromCurrency?: CurrencyCode, decimals = false): string => {
    const converted = fromCurrency ? convertToBase(amount, fromCurrency) : amount;
    return fmtCurrency(converted, baseCurrency, decimals);
  };

  const fmtNative = (amount: number, currency: CurrencyCode, decimals = false): string =>
    fmtCurrency(amount, currency, decimals);

  const isForeign = (currency: CurrencyCode) => currency !== baseCurrency;

  return (
    <CurrencyContext.Provider value={{ baseCurrency, setBaseCurrency, convertToBase, fmtBase, fmtNative, isForeign }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
