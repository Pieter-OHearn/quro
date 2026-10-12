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
  for (const key in options) {
    if (!CACHEABLE_OPTION_KEYS.has(key)) return new Intl.NumberFormat(locale, options);
  }
  const key = `${locale}|${options.style}|${options.currency}|${options.minimumFractionDigits}|${options.maximumFractionDigits}`;
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

/**
 * Formats a percentage in the user's number format, with grouping and a fixed number of decimals
 * (`1234.5` reads `1,234.5%` in en-US and `1.234,5%` in de-DE). Non-finite values and values
 * that round to zero render as 0, never as -0.
 */
export function formatPercent(
  value: number,
  numberFormat: NumberFormatPreference | string | null | undefined,
  fractionDigits = 1,
): string {
  const finite = Number.isFinite(value) ? value : 0;
  const roundsToZero = Math.round(Math.abs(finite) * 10 ** fractionDigits) === 0;
  return `${formatNumber(roundsToZero ? 0 : finite, resolveNumberFormat(numberFormat), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
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
