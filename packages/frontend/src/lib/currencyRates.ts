import { CURRENCY_CODES, isCurrencyCode, type CurrencyCode } from '@quro/shared';

export type CurrencyRateApiRow = {
  id: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number | string;
  provider?: string;
  sourceDate?: string;
  updatedAt: string;
};

export type CurrencyRate = {
  id: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  provider: string | null;
  sourceDate: string | null;
  updatedAt: string;
};

export type CurrencyRateTable = {
  latestUpdatedAt: string | null;
  missingCurrencies: CurrencyCode[];
  staleCurrencies: CurrencyCode[];
  rateIndex: ReadonlyMap<string, number>;
  rates: CurrencyRate[];
};

const EUR_CURRENCY: CurrencyCode = 'EUR';
const CURRENCY_RATE_STALE_AFTER_HOURS = 48;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

function toRateKey(fromCurrency: CurrencyCode, toCurrency: CurrencyCode): string {
  return `${fromCurrency}:${toCurrency}`;
}

function parseRate(value: number | string): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseAmount(value: number | string): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isFreshTimestamp(updatedAt: string, now: Date): boolean {
  const timestamp = parseTimestamp(updatedAt);
  if (timestamp === null) return false;
  return now.getTime() - timestamp <= CURRENCY_RATE_STALE_AFTER_HOURS * MS_PER_HOUR;
}

function resolveDirectRate(
  rateIndex: ReadonlyMap<string, number>,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
): number | null {
  if (fromCurrency === toCurrency) return 1;

  const direct = rateIndex.get(toRateKey(fromCurrency, toCurrency));
  if (direct) return direct;

  const inverse = rateIndex.get(toRateKey(toCurrency, fromCurrency));
  if (inverse) return 1 / inverse;

  return null;
}

export function createCurrencyRateTable(
  rows: ReadonlyArray<CurrencyRateApiRow>,
  now = new Date(),
): CurrencyRateTable {
  const rates = rows.map((row, index) => {
    if (!isCurrencyCode(row.fromCurrency) || !isCurrencyCode(row.toCurrency)) {
      throw new Error(`Invalid currency code in currency rate row ${index + 1}`);
    }

    const rate = parseRate(row.rate);
    if (rate === null) {
      throw new Error(`Invalid rate in currency rate row ${index + 1}`);
    }

    return {
      id: row.id,
      fromCurrency: row.fromCurrency,
      toCurrency: row.toCurrency,
      rate,
      provider: typeof row.provider === 'string' ? row.provider : null,
      sourceDate: typeof row.sourceDate === 'string' ? row.sourceDate : null,
      updatedAt: row.updatedAt,
    } satisfies CurrencyRate;
  });

  const rateIndex = new Map<string, number>();
  const staleRateKeys = new Set<string>();
  for (const rate of rates) {
    const key = toRateKey(rate.fromCurrency, rate.toCurrency);
    rateIndex.set(key, rate.rate);
    if (!isFreshTimestamp(rate.updatedAt, now)) staleRateKeys.add(key);
  }

  const missingCurrencies = CURRENCY_CODES.filter(
    (currency) => resolveDirectRate(rateIndex, currency, EUR_CURRENCY) === null,
  );
  const staleCurrencies = CURRENCY_CODES.filter((currency) => {
    if (currency === EUR_CURRENCY) return false;
    const directKey = toRateKey(currency, EUR_CURRENCY);
    if (rateIndex.has(directKey)) return staleRateKeys.has(directKey);

    const inverseKey = toRateKey(EUR_CURRENCY, currency);
    if (rateIndex.has(inverseKey)) return staleRateKeys.has(inverseKey);

    return false;
  });

  const latestUpdatedAt = rates.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);

  return {
    latestUpdatedAt,
    missingCurrencies,
    staleCurrencies,
    rateIndex,
    rates,
  };
}

export function convertCurrencyAmount(
  amount: number | string,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  table: CurrencyRateTable,
): number | null {
  const numericAmount = parseAmount(amount);
  if (numericAmount === null) return null;
  if (fromCurrency === toCurrency) return numericAmount;

  const direct = resolveDirectRate(table.rateIndex, fromCurrency, toCurrency);
  if (direct !== null) return numericAmount * direct;

  const fromToEur = resolveDirectRate(table.rateIndex, fromCurrency, EUR_CURRENCY);
  const toToEur = resolveDirectRate(table.rateIndex, toCurrency, EUR_CURRENCY);

  if (fromToEur === null || toToEur === null) return null;

  return (numericAmount * fromToEur) / toToEur;
}
