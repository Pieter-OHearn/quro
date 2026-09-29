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
const CACHEABLE_OPTION_KEYS = new Set([
  'style',
  'currency',
  'minimumFractionDigits',
  'maximumFractionDigits',
]);

function getNumberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const entries = Object.entries(options);
  if (!entries.every(([key]) => CACHEABLE_OPTION_KEYS.has(key))) {
    return new Intl.NumberFormat(locale, options);
  }
  const key = [
    locale,
    options.style,
    options.currency,
    options.minimumFractionDigits,
    options.maximumFractionDigits,
  ].join('|');
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

/** Formats a percentage; non-finite values and negative zero render as 0. */
export function formatPercent(value: number, fractionDigits = 1): string {
  const text = (Number.isFinite(value) ? value : 0).toFixed(fractionDigits);
  return `${Number(text) === 0 ? (0).toFixed(fractionDigits) : text}%`;
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
export * from './validation.js';
