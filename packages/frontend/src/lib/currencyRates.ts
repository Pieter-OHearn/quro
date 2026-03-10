import { CURRENCY_CODES, isCurrencyCode, type CurrencyCode } from '@quro/shared';

export type CurrencyRateApiRow = {
  id: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number | string;
  updatedAt: string;
};

export type CurrencyRate = {
  id: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  updatedAt: string;
};

export type CurrencyRateTable = {
  latestUpdatedAt: string | null;
  missingCurrencies: CurrencyCode[];
  rateIndex: ReadonlyMap<string, number>;
  rates: CurrencyRate[];
};

const EUR_CURRENCY: CurrencyCode = 'EUR';

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
      updatedAt: row.updatedAt,
    } satisfies CurrencyRate;
  });

  const rateIndex = new Map<string, number>();
  for (const rate of rates) {
    rateIndex.set(toRateKey(rate.fromCurrency, rate.toCurrency), rate.rate);
  }

  const missingCurrencies = CURRENCY_CODES.filter(
    (currency) => resolveDirectRate(rateIndex, currency, EUR_CURRENCY) === null,
  );

  const latestUpdatedAt = rates.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);

  return {
    latestUpdatedAt,
    missingCurrencies,
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
