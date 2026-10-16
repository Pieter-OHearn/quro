/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { unitPriceDecimals, type Holding } from '@quro/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildPositionMeasures,
  describePriceSource,
  getEffectivePrice,
  HoldingPositionTable,
} from './HoldingPositionPanel';
import type { Position } from '../utils/position';

const holding: Holding = {
  id: 1,
  name: 'Fictional Retail Group',
  ticker: 'FRGP',
  currentPrice: 18.75,
  currency: 'GBP',
  sector: 'Consumer',
  priceUpdatedAt: '2026-10-12T08:00:00.000Z',
};
const position: Position = {
  shares: 150,
  avgCost: 29.9667,
  costBasis: 4_495,
  totalDividends: 0,
  realizedGain: 0,
};

const fmtPrice = (amount: number, currency: string, decimals = 2) =>
  `${currency} ${amount.toFixed(decimals)}`;
const fmtNative = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;

const render = (overrides: Partial<Holding> = {}, base = 'EUR', pos: Position = position) =>
  renderToStaticMarkup(
    <HoldingPositionTable
      holding={{ ...holding, ...overrides }}
      position={pos}
      baseCurrency={base}
      numberFormat="en-US"
      ratesUpdatedAt="2026-10-16T09:00:00.000Z"
      convertToBase={(value, currency) => (currency === base ? value : value * 1.18)}
      fmtNative={fmtNative}
      fmtPrice={fmtPrice}
      onEditHolding={() => {}}
    />,
  );

test('a foreign holding stacks the base value under each native value, with the rate and caveat', () => {
  const markup = render();

  expect(markup).toContain('<dl');
  expect(markup).not.toContain('<table');
  for (const label of [
    'Price',
    'Avg cost',
    'Market value',
    'Cost basis',
    'Unrealized gain',
    'Dividends',
    'Realized gain',
  ]) {
    expect(markup).toContain(`>${label}</dt>`);
  }
  expect(markup).toContain('GBP 2812.50');
  expect(markup).toContain('<span class="sr-only">in EUR: </span>EUR 3318.75');
  expect(markup).toContain('<span class="sr-only">in GBP: </span>');
  expect(markup).toContain('1 GBP = 1.1800 EUR (rates updated 16 Oct 2026)');
  expect(markup).toContain('the rate at purchase is not stored');
  expect(markup).toContain('Correct holding');
  expect(markup).toContain('aria-labelledby=');
  expect(markup).toContain('Position<span class="sr-only"> of Fictional Retail Group</span>');
});

test('price and average cost share one precision and money keeps two decimals', () => {
  const markup = render();

  expect(markup).toContain('GBP 29.97');
  expect(markup).not.toContain('29.9667');
  expect(unitPriceDecimals(18.75)).toBe(2);
  expect(unitPriceDecimals(123.4567)).toBe(4);
  expect(unitPriceDecimals(0.5)).toBe(2);
  expect(render({ currentPrice: 123.4567 })).toContain('GBP 29.9667');
});

test('a holding in the base currency has one line per figure and no rate note', () => {
  const markup = render({ currency: 'EUR' });

  expect(markup).not.toContain('in EUR');
  expect(markup).not.toContain('today&#x27;s rate');
  expect(markup).toContain('EUR 2812.50');
  expect(markup).not.toContain('EUR 3318.75');
});

test('no value is repeated: distributions and realized gain are cells of the strip', () => {
  const markup = render({ currency: 'EUR' }, 'EUR', {
    ...position,
    totalDividends: 123.45,
    realizedGain: -50,
  });

  expect(markup.split('EUR 123.45').length - 1).toBe(1);
  expect(markup).toContain('>Dividends</dt>');
});

test('the unrealized gain keeps its sign and a loss reads as a loss in both currencies', () => {
  const markup = render();

  expect(markup).toContain('<span class="sr-only">down </span>−£1,682.50');
  expect(markup).toContain('<span class="sr-only">down </span>−€1,985.35');
});

test('rows use the manual price over the synced one and flag it', () => {
  const manual = { ...holding, manualPrice: 20 };

  expect(getEffectivePrice(manual)).toBe(20);
  expect(buildPositionMeasures(manual, position)[0].value).toBe(20);
  expect(render({ manualPrice: 20 })).toContain('Manual price');
  expect(describePriceSource(manual, fmtPrice)).toBe(
    'Manual price in use. The synced price is GBP 18.75.',
  );
});

test('the price source tells synced, sync-off and undated prices apart', () => {
  expect(describePriceSource(holding, fmtPrice)).toBe('Price synced on 12 Oct 2026.');
  expect(describePriceSource({ ...holding, excludeFromSync: true }, fmtPrice)).toContain(
    'sync is off',
  );
  expect(describePriceSource({ ...holding, priceUpdatedAt: null }, fmtPrice)).toBe(
    'No price sync date is recorded.',
  );
});

test('a closed-out position, negative equity and very large values stay exact', () => {
  const closed = render({}, 'EUR', { ...position, shares: 0, costBasis: 0, avgCost: 0 });
  expect(closed).toContain('GBP 0.00');

  const large = render({ currentPrice: 1_000_000 }, 'EUR', {
    ...position,
    shares: 1_000_000,
    costBasis: 0,
  });
  expect(large).toContain('GBP 1000000000000.00');
});
