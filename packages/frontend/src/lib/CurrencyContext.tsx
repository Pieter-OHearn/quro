import {
  CurrencyContext,
  type CurrencyContextType,
  type CurrencyRatesStatus,
} from './currencyContextValue';
export { useCurrency } from './currencyContextValue';
export type { CurrencyContextType, CurrencyRatesStatus } from './currencyContextValue';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CURRENCY_CODES,
  CURRENCY_META,
  DEFAULT_NUMBER_FORMAT,
  formatCurrency as formatCurrencyValue,
  isCurrencyCode,
  isNumberFormatPreference,
  type CurrencyCode,
  type NumberFormatPreference,
  type User,
} from '@quro/shared';
import { Button, LoadingSpinner } from '@/components/ui';
import { useAuth } from './AuthContext';
import { apiPut } from './api';
import { convertCurrencyAmount, type CurrencyRateTable } from './currencyRates';
import {
  getCurrencyRatesErrorDetail,
  isCurrencyRatesUnavailableError,
  useCurrencyRates,
} from './useCurrencyRates';

export { CURRENCY_CODES, CURRENCY_META };
export type { CurrencyCode };

export type CurrencyRatesFailureMode = 'fx-unavailable' | 'app-error';

type CurrencyRatesQueryState = Pick<
  ReturnType<typeof useCurrencyRates>,
  'data' | 'error' | 'isError' | 'isPending' | 'refetch'
>;

export function getCurrencyRatesFailureMode(error: unknown): CurrencyRatesFailureMode {
  return isCurrencyRatesUnavailableError(error) ? 'fx-unavailable' : 'app-error';
}

function normalizeCurrency(currency: string): CurrencyCode {
  if (isCurrencyCode(currency)) return currency;
  return 'EUR';
}

function normalizeNumberFormat(numberFormat: unknown): NumberFormatPreference {
  return isNumberFormatPreference(numberFormat) ? numberFormat : DEFAULT_NUMBER_FORMAT;
}

function formatCurrency(
  amount: number,
  currency: string,
  decimals = true,
  numberFormat: NumberFormatPreference,
): string {
  if (!Number.isFinite(amount)) return 'Unavailable';
  return formatCurrencyValue(amount, normalizeCurrency(currency), decimals, numberFormat);
}

type CurrencyRatesFallbackProps = {
  detail: string | null;
  onRetry: () => void;
};

function CurrencyRatesFallback({ detail, onRetry }: Readonly<CurrencyRatesFallbackProps>) {
  return (
    <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl border border-warning-border bg-surface p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">
          Currency Rates Unavailable
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-fg">Converted balances are paused</h1>
        <p className="mt-3 text-sm leading-6 text-fg-muted">
          Quro could not load the synced FX rates required to render converted totals safely. Native
          balances remain stored, but cross-currency views stay blocked until the rate source is
          available again.
        </p>
        {detail ? (
          <p className="mt-4 rounded-2xl bg-surface-sunken px-4 py-3 text-xs leading-5 text-fg-subtle">
            {detail}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={onRetry}>Retry rate fetch</Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      </div>
    </div>
  );
}

function getCurrencyRatesStatus(
  hasUser: boolean,
  ratesQuery: CurrencyRatesQueryState,
): CurrencyRatesStatus {
  if (!hasUser) return 'idle';
  if (ratesQuery.isPending) return 'loading';
  if (ratesQuery.isError) return 'error';
  return 'ready';
}

function renderCurrencyRatesGate(
  hasUser: boolean,
  authLoading: boolean,
  ratesQuery: CurrencyRatesQueryState,
): ReactNode | null {
  if (hasUser && !authLoading && ratesQuery.isPending) {
    return <LoadingSpinner className="min-h-screen" label="Loading synced currency rates" />;
  }

  if (hasUser && ratesQuery.isError) {
    if (getCurrencyRatesFailureMode(ratesQuery.error) === 'fx-unavailable') {
      return (
        <CurrencyRatesFallback
          detail={getCurrencyRatesErrorDetail(ratesQuery.error)}
          onRetry={() => {
            void ratesQuery.refetch();
          }}
        />
      );
    }

    throw ratesQuery.error instanceof Error
      ? ratesQuery.error
      : new Error('Failed to load synced currency rates');
  }

  return null;
}

function useCurrencyFormatters(
  baseCurrency: CurrencyCode,
  numberFormat: NumberFormatPreference,
  hasUser: boolean,
  table: CurrencyRateTable | undefined,
) {
  const convertToBase = useCallback(
    (amount: number, fromCurrency: string): number => {
      const safeCurrency = normalizeCurrency(fromCurrency);

      if (!table) {
        if (!hasUser || safeCurrency === baseCurrency) return amount;
        throw new Error('Currency rates are not ready');
      }

      const converted = convertCurrencyAmount(amount, safeCurrency, baseCurrency, table);
      if (converted === null) {
        throw new Error(`Missing synced FX rate for ${safeCurrency} -> ${baseCurrency}`);
      }

      return converted;
    },
    [baseCurrency, hasUser, table],
  );

  const fmtBase = useCallback(
    (amount: number, fromCurrency?: string, decimals = true): string => {
      const converted = fromCurrency ? convertToBase(amount, fromCurrency) : amount;
      return formatCurrency(converted, baseCurrency, decimals, numberFormat);
    },
    [baseCurrency, convertToBase, numberFormat],
  );

  const fmtNative = useCallback(
    (amount: number, currency: string, decimals = true): string =>
      formatCurrency(amount, currency, decimals, numberFormat),
    [numberFormat],
  );

  const isForeign = useCallback(
    (currency: string) => normalizeCurrency(currency) !== baseCurrency,
    [baseCurrency],
  );

  return { convertToBase, fmtBase, fmtNative, isForeign };
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, replaceUser } = useAuth();
  const ratesQuery = useCurrencyRates();
  const [baseCurrency, setBaseCurrencyState] = useState<CurrencyCode>(
    normalizeCurrency(user?.baseCurrency ?? 'EUR'),
  );
  const numberFormat = normalizeNumberFormat(user?.numberFormat);
  const hasUser = Boolean(user);
  const ratesStatus = getCurrencyRatesStatus(hasUser, ratesQuery);
  const gate = renderCurrencyRatesGate(hasUser, authLoading, ratesQuery);

  useEffect(() => {
    setBaseCurrencyState(normalizeCurrency(user?.baseCurrency ?? 'EUR'));
  }, [user?.baseCurrency]);

  const setBaseCurrency = useCallback(
    (nextCurrency: CurrencyCode) => {
      if (nextCurrency === baseCurrency) return;

      const previousCurrency = baseCurrency;
      setBaseCurrencyState(nextCurrency);

      if (!user) return;

      void apiPut<User>('/api/settings/preferences', { baseCurrency: nextCurrency })
        .then((response) => {
          replaceUser(response);
        })
        .catch(() => {
          setBaseCurrencyState(previousCurrency);
        });
    },
    [baseCurrency, replaceUser, user],
  );

  const table = ratesQuery.data;
  const { convertToBase, fmtBase, fmtNative, isForeign } = useCurrencyFormatters(
    baseCurrency,
    numberFormat,
    hasUser,
    table,
  );
  const ratesUpdatedAt = table?.latestUpdatedAt ?? null;
  const value = useMemo<CurrencyContextType>(
    () => ({
      baseCurrency,
      numberFormat,
      setBaseCurrency,
      convertToBase,
      fmtBase,
      fmtNative,
      isForeign,
      ratesStatus,
      ratesUpdatedAt,
    }),
    [
      baseCurrency,
      numberFormat,
      setBaseCurrency,
      convertToBase,
      fmtBase,
      fmtNative,
      isForeign,
      ratesStatus,
      ratesUpdatedAt,
    ],
  );

  if (gate) return gate;

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export type ConvertToBaseFn = CurrencyContextType['convertToBase'];
export type IsForeignFn = CurrencyContextType['isForeign'];
