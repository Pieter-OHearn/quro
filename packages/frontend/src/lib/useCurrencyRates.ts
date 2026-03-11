import { useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { api } from './api';
import {
  createCurrencyRateTable,
  type CurrencyRateApiRow,
  type CurrencyRateTable,
} from './currencyRates';

export const CURRENCY_RATES_QUERY_KEY = ['currency', 'rates'] as const;

export class CurrencyRatesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurrencyRatesUnavailableError';
  }
}

export function isCurrencyRatesUnavailableError(
  error: unknown,
): error is CurrencyRatesUnavailableError {
  return error instanceof CurrencyRatesUnavailableError;
}

export function getCurrencyRatesErrorDetail(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) return error.message;
  return null;
}

export function useCurrencyRates() {
  const { user } = useAuth();

  return useQuery({
    queryKey: CURRENCY_RATES_QUERY_KEY,
    enabled: Boolean(user),
    queryFn: async (): Promise<CurrencyRateTable> => {
      const { data } = await api.get('/api/currency/rates');
      if (!Array.isArray(data?.data)) {
        throw new CurrencyRatesUnavailableError('Invalid currency rates response');
      }

      const table = createCurrencyRateTable(data.data as CurrencyRateApiRow[]);
      if (table.missingCurrencies.length > 0) {
        throw new CurrencyRatesUnavailableError(
          `Missing server-backed FX rates for: ${table.missingCurrencies.join(', ')}`,
        );
      }

      return table;
    },
  });
}
