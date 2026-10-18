import { formatNumber, formatPercent } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';

/**
 * Formatters for the Exposure view. The backend aggregates in EUR; each EUR figure is converted
 * once, to the display currency, here.
 */
export function useExposureFormat() {
  const { fmtBase, numberFormat } = useCurrency();
  return {
    money: (eur: number) => fmtBase(eur, 'EUR'),
    percent: (share: number) => formatPercent(share, numberFormat, 1),
    decimal: (value: number, digits = 1) =>
      formatNumber(value, numberFormat, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }),
  };
}

export type ExposureFormat = ReturnType<typeof useExposureFormat>;
