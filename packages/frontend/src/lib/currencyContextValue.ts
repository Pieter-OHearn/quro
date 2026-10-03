import { createContext, useContext } from 'react';
import type { CurrencyCode, NumberFormatPreference } from '@quro/shared';

export type CurrencyRatesStatus = 'idle' | 'loading' | 'ready' | 'error';

export type CurrencyContextType = {
  baseCurrency: CurrencyCode;
  numberFormat: NumberFormatPreference;
  setBaseCurrency: (c: CurrencyCode) => void;
  convertToBase: (amount: number, fromCurrency: string) => number;
  fmtBase: (amount: number, fromCurrency?: string, decimals?: boolean) => string;
  fmtNative: (amount: number, currency: string, decimals?: boolean) => string;
  isForeign: (currency: string) => boolean;
  ratesStatus: CurrencyRatesStatus;
  ratesUpdatedAt: string | null;
};

export const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
