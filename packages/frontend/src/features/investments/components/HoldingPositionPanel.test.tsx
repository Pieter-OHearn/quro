/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Holding } from '@quro/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildPositionRows,
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

const fmtPrice = (amount: number, currency: string) => `${currency} ${amount.toFixed(4)}`;
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

test('a foreign holding shows native and base columns, the rate and a correction action', () => {
  const markup = render();

  expect(markup).toContain('>GBP</th>');
  expect(markup).toContain('>EUR</th>');
  expect(markup).toContain('GBP 2812.50');
  expect(markup).toContain('EUR 3318.75');
  expect(markup).toContain('1 GBP = 1.1800 EUR (rates updated 16 Oct 2026)');
  expect(markup).toContain('the rate at purchase is not stored');
  expect(markup).toContain('Correct holding');
  expect(markup).toContain('aria-label="Fictional Retail Group position"');
});

test('a holding in the base currency has one value column and no rate note', () => {
  const markup = render({ currency: 'EUR' });

  expect(markup).not.toContain('>GBP</th>');
  expect(markup).not.toContain('today&#x27;s rate');
  expect(markup).toContain('>EUR</th>');
});

test('the unrealized gain keeps its sign and a loss reads as a loss in both currencies', () => {
  const markup = render();

  expect(markup).toContain('<span class="sr-only">down </span>−£1,682.50');
  expect(markup).toContain('<span class="sr-only">down </span>−€1,985.35');
});

test('rows use the manual price over the synced one and flag it', () => {
  const manual = { ...holding, manualPrice: 20 };

  expect(getEffectivePrice(manual)).toBe(20);
  expect(buildPositionRows(manual, position)[0].native.value).toBe(20);
  expect(render({ manualPrice: 20 })).toContain('Manual price');
  expect(describePriceSource(manual, fmtPrice)).toBe(
    'Manual price in use. The synced price is GBP 18.7500.',
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
