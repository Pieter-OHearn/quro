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

const DECIMAL_BASE = 10;

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
  const roundsToZero = Math.round(Math.abs(finite) * DECIMAL_BASE ** fractionDigits) === 0;
  return `${formatNumber(roundsToZero ? 0 : finite, resolveNumberFormat(numberFormat), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

const TRUE_MINUS = '\u2212';

/**
 * Formats a money amount in the user's number format. A negative amount reads with a true minus
 * sign (U+2212), as `−€612.75` or `−612,75 €`; an amount that rounds to zero has no sign.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  decimals = true,
  numberFormat: NumberFormatPreference = DEFAULT_NUMBER_FORMAT,
): string {
  const parts = getNumberFormat(resolveNumberFormat(numberFormat), {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).formatToParts(amount);
  // `-0` and amounts that round to zero format with a sign; drop it rather than rely on
  // `signDisplay: 'negative'`, which older browsers reject.
  const roundsToZero = parts.every(
    (part) => (part.type !== 'integer' && part.type !== 'fraction') || /^0+$/.test(part.value),
  );
  return parts
    .map((part) => {
      if (part.type !== 'minusSign') return part.value;
      return roundsToZero ? '' : TRUE_MINUS;
    })
    .join('');
}

const UNIT_PRICE_MIN_DECIMALS = 2;
const UNIT_PRICE_MAX_DECIMALS = 4;

/**
 * Formats a unit price (price per share, a current, manual or historical price) in the user's
 * number format with two to four decimals: zeros beyond the second decimal are trimmed, so
 * `123.4567` reads `€123.4567`, `123.45` reads `€123.45` and `0.5` reads `€0.50`. Money amounts
 * keep the two decimals of `formatCurrency`.
 */
export function formatUnitPrice(
  amount: number,
  currency: string,
  numberFormat: NumberFormatPreference = DEFAULT_NUMBER_FORMAT,
): string {
  return formatNumber(amount, numberFormat, {
    style: 'currency',
    currency,
    minimumFractionDigits: UNIT_PRICE_MIN_DECIMALS,
    maximumFractionDigits: UNIT_PRICE_MAX_DECIMALS,
  });
}

export * from './money.js';
export * from './date.js';
export * from './finance.js';
export * from './validation.js';
