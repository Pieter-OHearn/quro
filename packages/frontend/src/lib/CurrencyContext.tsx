import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CURRENCY_CODES, CURRENCY_META, isCurrencyCode, type CurrencyCode } from '@quro/shared';
import { Button, LoadingSpinner } from '@/components/ui';
import { useAuth } from './AuthContext';
import { api } from './api';
import { convertCurrencyAmount } from './currencyRates';
import {
  getCurrencyRatesErrorDetail,
  isCurrencyRatesUnavailableError,
  useCurrencyRates,
} from './useCurrencyRates';

export { CURRENCY_CODES, CURRENCY_META };
export type { CurrencyCode };

export type CurrencyRatesStatus = 'idle' | 'loading' | 'ready' | 'error';

type CurrencyContextType = {
  baseCurrency: CurrencyCode;
  setBaseCurrency: (c: CurrencyCode) => void;
  convertToBase: (amount: number, fromCurrency: string) => number;
  fmtBase: (amount: number, fromCurrency?: string, decimals?: boolean) => string;
  fmtNative: (amount: number, currency: string, decimals?: boolean) => string;
  isForeign: (currency: string) => boolean;
  ratesStatus: CurrencyRatesStatus;
  ratesUpdatedAt: string | null;
};

const CurrencyContext = createContext<CurrencyContextType | null>(null);

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

function formatCurrency(amount: number, currency: string, decimals = true): string {
  if (!Number.isFinite(amount)) return 'Unavailable';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalizeCurrency(currency),
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(amount);
}

type CurrencyRatesFallbackProps = {
  detail: string | null;
  onRetry: () => void;
};

function CurrencyRatesFallback({ detail, onRetry }: Readonly<CurrencyRatesFallbackProps>) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">
          Currency Rates Unavailable
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          Converted balances are paused
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Quro could not load the server-backed FX rates required to render converted totals safely.
          Native balances remain stored, but cross-currency views stay blocked until the rate source
          is available again.
        </p>
        {detail ? (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
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
    return <LoadingSpinner className="min-h-screen" label="Loading server-backed currency rates" />;
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
      : new Error('Failed to load server-backed currency rates');
  }

  return null;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, replaceUser } = useAuth();
  const ratesQuery = useCurrencyRates();
  const [baseCurrency, setBaseCurrencyState] = useState<CurrencyCode>(
    normalizeCurrency(user?.baseCurrency ?? 'EUR'),
  );
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

      void api
        .put('/api/settings/preferences', { baseCurrency: nextCurrency })
        .then((response) => {
          replaceUser(response.data.data);
        })
        .catch(() => {
          setBaseCurrencyState(previousCurrency);
        });
    },
    [baseCurrency, replaceUser, user],
  );

  if (gate) return gate;

  const convertToBase = (amount: number, fromCurrency: string): number => {
    const safeCurrency = normalizeCurrency(fromCurrency);
    const table = ratesQuery.data;

    if (!table) {
      if (!hasUser || safeCurrency === baseCurrency) return amount;
      throw new Error('Currency rates are not ready');
    }

    const converted = convertCurrencyAmount(amount, safeCurrency, baseCurrency, table);
    if (converted === null) {
      throw new Error(`Missing server-backed FX rate for ${safeCurrency} -> ${baseCurrency}`);
    }

    return converted;
  };

  const fmtBase = (amount: number, fromCurrency?: string, decimals = true): string => {
    const converted = fromCurrency ? convertToBase(amount, fromCurrency) : amount;
    return formatCurrency(converted, baseCurrency, decimals);
  };

  const fmtNative = (amount: number, currency: string, decimals = true): string =>
    formatCurrency(amount, currency, decimals);

  const isForeign = (currency: string) => normalizeCurrency(currency) !== baseCurrency;

  return (
    <CurrencyContext.Provider
      value={{
        baseCurrency,
        setBaseCurrency,
        convertToBase,
        fmtBase,
        fmtNative,
        isForeign,
        ratesStatus,
        ratesUpdatedAt: ratesQuery.data?.latestUpdatedAt ?? null,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
