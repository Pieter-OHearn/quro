import { CURRENCY_CODES, isCurrencyCode, type CurrencyCode } from '@quro/shared';

export const FX_BASE_CURRENCY: CurrencyCode = 'EUR';
export const CURRENCY_RATE_STALE_AFTER_HOURS = 48;
export const SEED_RATE_PROVIDER = 'seed';

const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

export type CurrencyRateCacheRow = {
  fromCurrency: string;
  toCurrency: string;
  rate: unknown;
  provider?: string | null;
  updatedAt: Date | string | null;
};

export class CurrencyRatesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurrencyRatesUnavailableError';
  }
}

function parseRate(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTimestamp(value: Date | string | null): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isCurrencyRateFresh(
  updatedAt: Date | string | null,
  now = new Date(),
  staleAfterHours = CURRENCY_RATE_STALE_AFTER_HOURS,
): boolean {
  const timestamp = parseTimestamp(updatedAt);
  if (timestamp === null) return false;
  return now.getTime() - timestamp <= staleAfterHours * MS_PER_HOUR;
}

export function buildRatesToBaseCurrency(
  rows: readonly CurrencyRateCacheRow[],
  _now = new Date(),
  baseCurrency: CurrencyCode = FX_BASE_CURRENCY,
): Map<string, number> {
  const rates = new Map<string, number>();

  for (const row of rows) {
    if (row.toCurrency !== baseCurrency) continue;
    if (!isCurrencyCode(row.fromCurrency)) {
      throw new CurrencyRatesUnavailableError(`Invalid FX currency: ${row.fromCurrency}`);
    }
    if (row.fromCurrency === baseCurrency) continue;

    const rate = parseRate(row.rate);
    if (rate === null) {
      throw new CurrencyRatesUnavailableError(
        `Invalid FX rate for ${row.fromCurrency} -> ${baseCurrency}`,
      );
    }

    rates.set(row.fromCurrency, rate);
  }

  rates.set(baseCurrency, 1);

  const missingCurrencies = CURRENCY_CODES.filter((currency) => !rates.has(currency));
  if (missingCurrencies.length > 0) {
    throw new CurrencyRatesUnavailableError(
      `Missing FX rates for: ${missingCurrencies.join(', ')}`,
    );
  }

  return rates;
}

export function convertToBaseCurrency(
  amount: number,
  currency: string,
  rates: ReadonlyMap<string, number>,
  baseCurrency: CurrencyCode = FX_BASE_CURRENCY,
): number {
  if (currency === baseCurrency) return amount;

  const rate = rates.get(currency);
  if (rate == null) {
    throw new CurrencyRatesUnavailableError(`Missing FX rate for ${currency} -> ${baseCurrency}`);
  }

  return amount * rate;
}
