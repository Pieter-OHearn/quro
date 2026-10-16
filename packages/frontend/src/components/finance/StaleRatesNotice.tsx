import { StateNotice } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { formatDate } from '@/lib/utils';

/** "GBP", "GBP and USD", "GBP, USD and CHF". */
function listCurrencies(currencies: readonly string[]): string {
  if (currencies.length <= 1) return currencies.join('');
  return `${currencies.slice(0, -1).join(', ')} and ${currencies[currencies.length - 1]}`;
}

/**
 * Says so when a synced exchange rate is more than 48 hours old, because every figure converted
 * from that currency still uses it. Nothing is hidden or guessed: the rate stays in use and the
 * notice names the currencies and the date. Renders nothing while every rate is fresh.
 */
export function StaleRatesNotice({ className }: Readonly<{ className?: string }>) {
  const { staleRateCurrencies, staleRatesSince } = useCurrency();
  if (staleRateCurrencies.length === 0) return null;

  const since = staleRatesSince ? formatDate(staleRatesSince) : null;
  return (
    <StateNotice
      testId="stale-rates-notice"
      title="Exchange rates are out of date"
      className={className}
    >
      The {listCurrencies(staleRateCurrencies)} rate
      {staleRateCurrencies.length === 1 ? ' was' : 's were'} last updated
      {since ? ` on ${since}` : ''}. Totals converted from{' '}
      {staleRateCurrencies.length === 1 ? 'that currency' : 'those currencies'} use{' '}
      {staleRateCurrencies.length === 1 ? 'it' : 'them'} as it is and may differ from today&apos;s
      value.
    </StateNotice>
  );
}
