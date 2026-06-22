import { asc } from 'drizzle-orm';
import { type CurrencyCode } from '@quro/shared';
import { db } from '../db/client';
import { currencyRateHistory } from '../db/schema';
import { convertToBaseCurrency, FX_BASE_CURRENCY } from './currencyRateCache';

const DATE_PART_LENGTH = 10;

export type HistoricalCurrencyRateRow = {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  rateDate: string;
  provider: string;
  syncedAt: Date;
};

export type DatedCurrencyConversion = {
  value: number;
  rateDate: string | null;
  estimated: boolean;
};

export type HistoricalRateCoverage = {
  missingCurrencies: string[];
  estimatedDates: string[];
};

export type HistoricalCurrencyRateResolver = {
  convertToBase: (amount: number, currency: string, date: string | Date) => DatedCurrencyConversion;
  getCoverage: () => HistoricalRateCoverage;
};

function toDateOnly(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, DATE_PART_LENGTH);
  return value.slice(0, DATE_PART_LENGTH);
}

function toRateKey(fromCurrency: string, toCurrency: string): string {
  return `${fromCurrency}:${toCurrency}`;
}

function buildRowsByPair(
  rows: readonly HistoricalCurrencyRateRow[],
): Map<string, HistoricalCurrencyRateRow[]> {
  const rowsByPair = new Map<string, HistoricalCurrencyRateRow[]>();
  for (const row of rows) {
    const key = toRateKey(row.fromCurrency, row.toCurrency);
    const bucket = rowsByPair.get(key);
    if (bucket) bucket.push(row);
    else rowsByPair.set(key, [row]);
  }

  for (const bucket of rowsByPair.values()) {
    bucket.sort((left, right) => left.rateDate.localeCompare(right.rateDate));
  }

  return rowsByPair;
}

function findNearestPreviousRow(
  rows: readonly HistoricalCurrencyRateRow[],
  date: string,
): HistoricalCurrencyRateRow | null {
  let selected: HistoricalCurrencyRateRow | null = null;
  for (const row of rows) {
    if (row.rateDate > date) break;
    selected = row;
  }
  return selected;
}

export function buildHistoricalCurrencyRateResolver(
  rows: readonly HistoricalCurrencyRateRow[],
  currentRates: ReadonlyMap<string, number>,
  baseCurrency: CurrencyCode = FX_BASE_CURRENCY,
): HistoricalCurrencyRateResolver {
  const rowsByPair = buildRowsByPair(rows);
  const missingCurrencies = new Set<string>();
  const estimatedDates = new Set<string>();

  function convertToBase(
    amount: number,
    currency: string,
    date: string | Date,
  ): DatedCurrencyConversion {
    if (currency === baseCurrency)
      return { value: amount, rateDate: toDateOnly(date), estimated: false };

    const dateOnly = toDateOnly(date);
    const historicalRows = rowsByPair.get(toRateKey(currency, baseCurrency)) ?? [];
    const historicalRate = findNearestPreviousRow(historicalRows, dateOnly);
    if (historicalRate) {
      if (historicalRate.rateDate !== dateOnly) estimatedDates.add(dateOnly);
      return {
        value: amount * historicalRate.rate,
        rateDate: historicalRate.rateDate,
        estimated: historicalRate.rateDate !== dateOnly,
      };
    }

    const fallbackValue = convertToBaseCurrency(amount, currency, currentRates, baseCurrency);
    missingCurrencies.add(currency);
    estimatedDates.add(dateOnly);
    return { value: fallbackValue, rateDate: null, estimated: true };
  }

  return {
    convertToBase,
    getCoverage: () => ({
      missingCurrencies: [...missingCurrencies].sort(),
      estimatedDates: [...estimatedDates].sort(),
    }),
  };
}

export function loadHistoricalCurrencyRateRows(): Promise<HistoricalCurrencyRateRow[]> {
  return db
    .select({
      fromCurrency: currencyRateHistory.fromCurrency,
      toCurrency: currencyRateHistory.toCurrency,
      rate: currencyRateHistory.rate,
      rateDate: currencyRateHistory.rateDate,
      provider: currencyRateHistory.provider,
      syncedAt: currencyRateHistory.syncedAt,
    })
    .from(currencyRateHistory)
    .orderBy(
      asc(currencyRateHistory.fromCurrency),
      asc(currencyRateHistory.toCurrency),
      asc(currencyRateHistory.rateDate),
    );
}
