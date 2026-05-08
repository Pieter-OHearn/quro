import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { api } from './api';
import {
  createCurrencyRateTable,
  type CurrencyRateApiRow,
  type CurrencyRateTable,
} from './currencyRates';

export const CURRENCY_RATES_QUERY_KEY = ['currency', 'rates'] as const;
const SERVICE_UNAVAILABLE_STATUS = 503;

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
      let data: unknown;
      try {
        const response = await api.get('/api/currency/rates');
        data = response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === SERVICE_UNAVAILABLE_STATUS) {
          const message =
            typeof error.response.data?.error === 'string'
              ? error.response.data.error
              : 'Currency rates are unavailable';
          throw new CurrencyRatesUnavailableError(message);
        }
        throw error;
      }

      const payload = data as { data?: unknown };
      if (!Array.isArray(payload.data)) {
        throw new CurrencyRatesUnavailableError('Invalid currency rates response');
      }

      const table = createCurrencyRateTable(payload.data as CurrencyRateApiRow[]);
      if (table.missingCurrencies.length > 0) {
        throw new CurrencyRatesUnavailableError(
          `Missing synced FX rates for: ${table.missingCurrencies.join(', ')}`,
        );
      }

      return table;
    },
  });
}
