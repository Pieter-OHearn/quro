import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { holdingPriceHistory, holdings } from '../db/schema';
import { createIntegrationHelpers } from '../test/integration';

const marketModule = await import('./marketDataClient');
const getRealClient = marketModule.getMarketDataClient;
const requested: string[][] = [];
await mock.module('./marketDataClient', () => ({
  getMarketDataClient: () => ({
    getLatestEod: (symbols: string[]) => {
      requested.push(symbols);
      return Promise.resolve(
        Object.fromEntries(
          symbols.map((symbol) => [
            symbol,
            {
              close: 42,
              priceCurrency: 'USD',
              eodDate: '2026-10-01',
              tradeLast: '2026-10-01T12:00:00Z',
            },
          ]),
        ),
      );
    },
  }),
}));
const { syncAllHoldingPrices } = await import('./holdingPriceSync');
const integration = createIntegrationHelpers('holding-price-batch.quro.test');
beforeAll(() => integration.cleanup());
afterAll(async () => {
  await integration.cleanup();
  await mock.module('./marketDataClient', () => ({ getMarketDataClient: getRealClient }));
  mock.restore();
});

test('scheduled price sync fetches shared symbols once and writes each owners history', async () => {
  const first = await integration.signUp('first');
  const second = await integration.signUp('second');
  const base = {
    name: 'WP7 stock',
    ticker: 'WP7',
    sector: 'Test',
    currentPrice: 10,
    currency: 'EUR' as const,
  };
  const rows = await db
    .insert(holdings)
    .values([
      { ...base, userId: first.user.id },
      { ...base, userId: second.user.id },
      { ...base, userId: second.user.id, exchangeMic: 'XASX' },
      { ...base, userId: first.user.id, ticker: 'EXCLUDED', excludeFromSync: true },
      { ...base, userId: first.user.id, ticker: 'ARCHIVED', archivedAt: new Date() },
    ])
    .returning();
  requested.length = 0;
  const outcome = await syncAllHoldingPrices();
  expect(requested).toEqual([['WP7', 'WP7.AX']]);
  expect(outcome.summary).toMatchObject({
    requestedHoldings: 3,
    requestedSymbols: 2,
    updatedHoldings: 3,
    skippedHoldings: 0,
    issues: [],
  });
  for (const row of rows.slice(0, 3)) {
    const [updated] = await db.select().from(holdings).where(eq(holdings.id, row.id));
    expect(updated).toMatchObject({ userId: row.userId, currentPrice: 42, currency: 'USD' });
    const [history] = await db
      .select()
      .from(holdingPriceHistory)
      .where(eq(holdingPriceHistory.holdingId, row.id));
    expect(history).toMatchObject({
      userId: row.userId,
      closePrice: 42,
      priceCurrency: 'USD',
      eodDate: '2026-10-01',
    });
  }
  await syncAllHoldingPrices();
  expect(
    await db
      .select()
      .from(holdingPriceHistory)
      .where(eq(holdingPriceHistory.userId, second.user.id)),
  ).toHaveLength(2);
});
