/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CurrencyCode } from '@quro/shared';
import { CurrencyContext, type CurrencyContextType } from '@/lib/currencyContextValue';
import { StaleRatesNotice } from './StaleRatesNotice';

function render(staleRateCurrencies: CurrencyCode[], staleRatesSince: string | null) {
  const value = { staleRateCurrencies, staleRatesSince } as unknown as CurrencyContextType;
  return renderToStaticMarkup(
    <CurrencyContext.Provider value={value}>
      <StaleRatesNotice />
    </CurrencyContext.Provider>,
  );
}

describe('StaleRatesNotice', () => {
  test('renders nothing while every rate is fresh', () => {
    expect(render([], null)).toBe('');
  });

  test('names the stale currency and the date of its last update', () => {
    const markup = render(['GBP'], '2026-10-12T08:00:00.000Z');
    expect(markup).toContain('Exchange rates are out of date');
    expect(markup).toContain('The GBP rate was');
    expect(markup).toContain('12 Oct 2026');
  });

  test('lists several currencies', () => {
    const markup = render(['GBP', 'USD', 'CHF'], null);
    expect(markup).toContain('GBP, USD and CHF rates were');
    expect(markup).not.toContain(' on ');
  });
});
