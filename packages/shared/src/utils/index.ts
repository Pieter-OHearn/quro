import {
  DEFAULT_NUMBER_FORMAT,
  isNumberFormatPreference,
  type NumberFormatPreference,
} from '../types/index.js';

function resolveNumberFormat(
  numberFormat: NumberFormatPreference | string | null | undefined,
): NumberFormatPreference {
  return isNumberFormatPreference(numberFormat) ? numberFormat : DEFAULT_NUMBER_FORMAT;
}

export function formatNumber(
  amount: number,
  numberFormat: NumberFormatPreference = DEFAULT_NUMBER_FORMAT,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(resolveNumberFormat(numberFormat), options).format(amount);
}

export function formatCurrency(
  amount: number,
  currency: string,
  decimals = true,
  numberFormat: NumberFormatPreference = DEFAULT_NUMBER_FORMAT,
): string {
  return formatNumber(amount, numberFormat, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
}
