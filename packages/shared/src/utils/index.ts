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

const numberFormatCache = new Map<string, Intl.NumberFormat>();

function getNumberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = numberFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(
  amount: number,
  numberFormat: NumberFormatPreference = DEFAULT_NUMBER_FORMAT,
  options: Intl.NumberFormatOptions = {},
): string {
  return getNumberFormat(resolveNumberFormat(numberFormat), options).format(amount);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
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

export * from './money.js';
export * from './date.js';
export * from './finance.js';
