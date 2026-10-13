import { useCallback } from 'react';
import { formatUnitPrice, isCurrencyCode } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';

export type UnitPriceFormatFn = (amount: number, currency: string) => string;

/**
 * Formats unit prices (price per share, current, manual, sold and historical prices) with two to
 * four decimals in the user's number format. Money amounts keep `fmtNative`'s two decimals.
 * An unknown currency falls back to EUR and a non-finite price reads "Unavailable", like
 * `fmtNative`.
 */
export function useUnitPriceFormatter(): UnitPriceFormatFn {
  const { numberFormat } = useCurrency();
  return useCallback(
    (amount: number, currency: string) => {
      if (!Number.isFinite(amount)) return 'Unavailable';
      return formatUnitPrice(amount, isCurrencyCode(currency) ? currency : 'EUR', numberFormat);
    },
    [numberFormat],
  );
}
