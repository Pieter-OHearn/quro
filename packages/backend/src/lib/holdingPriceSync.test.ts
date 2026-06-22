import { afterAll, describe, expect, mock, test } from 'bun:test';

const holding = {
  id: 42,
  userId: 7,
  name: 'Commonwealth Bank',
  ticker: 'CBA',
  currentPrice: 100,
  currency: 'AUD' as const,
  sector: 'Financials',
  itemType: null,
  exchangeMic: 'XASX',
  industry: null,
  priceUpdatedAt: null,
  manualPrice: null,
  excludeFromSync: false,
  archivedAt: null,
};

const updatedHolding = {
  ...holding,
  currentPrice: 101.5,
  priceUpdatedAt: new Date('2026-06-22T10:00:00.000Z'),
};

let snapshotWriteShouldFail = false;

const { db: realDb } = await import('../db/client');

await mock.module('../db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([holding]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([updatedHolding]),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => {
          if (snapshotWriteShouldFail) {
            throw new Error('snapshot write failed');
          }
          return Promise.resolve();
        },
      }),
    }),
  },
}));

await mock.module('./marketDataClient', () => ({
  getMarketDataClient: () => ({
    getLatestEod: () =>
      Promise.resolve({
        'CBA.AX': {
          close: 101.5,
          priceCurrency: 'AUD',
          eodDate: '2026-06-22',
          tradeLast: '2026-06-22T10:00:00.000Z',
        },
      }),
  }),
}));

const { syncHoldingPricesForUser } = await import('./holdingPriceSync');

afterAll(async () => {
  await mock.module('../db/client', () => ({ db: realDb }));
  mock.restore();
});

describe('holding price sync', () => {
  test('reports a holding update even when the history snapshot write fails', async () => {
    snapshotWriteShouldFail = true;

    const outcome = await syncHoldingPricesForUser(holding.userId, { holdingIds: [holding.id] });

    expect(outcome.updates).toHaveLength(1);
    expect(outcome.updates[0]?.holding).toEqual(updatedHolding);
    expect(outcome.summary.updatedHoldings).toBe(1);
    expect(outcome.summary.skippedHoldings).toBe(0);
    expect(outcome.summary.issues).toEqual([
      {
        holdingId: holding.id,
        ticker: holding.ticker,
        reason: 'Price updated, but failed to persist history snapshot',
      },
    ]);
  });
});
