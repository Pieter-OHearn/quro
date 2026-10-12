import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { roundMoney, type Holding, type HoldingTransaction } from '@quro/shared';
import { db } from '../db/client';
import { holdings, holdingTransactions, netWorthSnapshots } from '../db/schema';
import { computeDerivedAllocations, upsertCurrentNetWorthSnapshot } from '../lib/netWorth';
import { moneyLimitError, roundUnitPrice } from '../lib/requestValidation';
import { createIntegrationHelpers, type AuthSession } from '../test/integration';

// Prices per share are unit prices, not money (docs/financial-invariants.md): they are stored
// with six decimals, and a holding's value is computed from the stored price and rounded to cents
// once. A dividend's amount travels in the same `price` field and is money, so it is rounded to
// cents.

const integration = createIntegrationHelpers('holding-prices.integration.quro.test');
const DATE = '2026-03-02';

let owner: AuthSession;

beforeAll(async () => {
  await integration.cleanup();
  owner = await integration.signUp('owner');
});
afterAll(() => integration.cleanup());

function send(method: string, path: string, json?: unknown, session = owner) {
  return integration.request(path, { method, cookie: session.cookie, json });
}

async function data<T>(response: Response): Promise<T> {
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return ((await response.json()) as { data: T }).data;
}

async function createHolding(body: Record<string, unknown>, session = owner): Promise<Holding> {
  const response = await send(
    'POST',
    '/api/investments/holdings',
    {
      name: 'Synthetic fund',
      ticker: 'SYNF',
      currency: 'EUR',
      sector: 'Index',
      priceCurrency: 'EUR',
      eodDate: DATE,
      ...body,
    },
    session,
  );
  return data<Holding>(response);
}

const createTransaction = async (
  holdingId: number,
  body: Record<string, unknown>,
  session = owner,
) =>
  await send(
    'POST',
    '/api/investments/holding-transactions',
    { holdingId, date: DATE, ...body },
    session,
  );

describe('six-decimal prices', () => {
  test('a four-decimal quote survives save and read in every price column', async () => {
    const holding = await createHolding({ currentPrice: 123.4567, manualPrice: '98,7654' });
    expect([holding.currentPrice, holding.manualPrice]).toEqual([123.4567, 98.7654]);

    const read = await data<Holding>(await send('GET', `/api/investments/holdings/${holding.id}`));
    expect([read.currentPrice, read.manualPrice]).toEqual([123.4567, 98.7654]);

    const history = await data<Array<{ holdingId: number; closePrice: number }>>(
      await send(
        'GET',
        `/api/investments/holding-price-history?holdingIds=${holding.id}&from=2026-01-01`,
      ),
    );
    expect(history.map((row) => row.closePrice)).toEqual([123.4567]);

    const buy = await data<HoldingTransaction>(
      await createTransaction(holding.id, { type: 'buy', shares: 1.5, price: 123.4567 }),
    );
    const stored = await data<HoldingTransaction>(
      await send('GET', `/api/investments/holding-transactions/${buy.id}`),
    );
    expect(stored.price).toBe(123.4567);
  });

  test('six decimals are kept and a seventh is rounded half away from zero', async () => {
    const holding = await createHolding({ currentPrice: '0.123456' });
    expect(holding.currentPrice).toBe(0.123456);

    const patched = await data<Holding>(
      await send('PATCH', `/api/investments/holdings/${holding.id}`, {
        currentPrice: 1.2345675,
        manualPrice: 0.0000004,
      }),
    );
    expect([patched.currentPrice, patched.manualPrice]).toEqual([1.234568, 0]);

    const buy = await data<HoldingTransaction>(
      await createTransaction(holding.id, { type: 'buy', shares: 2, price: 10.0000005 }),
    );
    expect(buy.price).toBe(10.000001);

    // A price that rounds to zero is not greater than zero.
    const zero = await createTransaction(holding.id, { type: 'buy', shares: 2, price: 0.0000004 });
    expect(zero.status).toBe(400);
    expect(await zero.json()).toEqual({ error: 'Price must be greater than zero' });
  });

  test('the database rounds a price exactly as request validation does', async () => {
    let state = 7;
    const next = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
    const values = Array.from({ length: 2_000 }, (_, index) =>
      Number(
        `${Math.floor(next() * 10 ** (index % 9))}.${String(Math.floor(next() * 1e9)).padStart(9, '0')}`,
      ),
    );
    const texts = values.map(String);
    const rows = await db.execute<{ stored: string }>(
      sql`select trim_scale(value::numeric(23, 6))::text as stored
          from unnest(${`{${texts.join(',')}}`}::text[]) with ordinality as input(value, position)
          order by position`,
    );
    expect(rows.map((row) => Number(row.stored))).toEqual(values.map(roundUnitPrice));
  });
});

describe('dividend amounts are money', () => {
  test('a dividend is rounded to cents, refused at zero cents and bounded like money', async () => {
    const holding = await createHolding({ currentPrice: 50 });

    const dividend = await data<HoldingTransaction>(
      await createTransaction(holding.id, { type: 'dividend', price: 12.345 }),
    );
    expect(dividend.price).toBe(12.35);

    const subCent = await createTransaction(holding.id, { type: 'dividend', price: 0.004 });
    expect(subCent.status).toBe(400);
    expect(await subCent.json()).toEqual({ error: 'Dividend amount must be greater than zero' });

    const tooLarge = await createTransaction(holding.id, { type: 'dividend', price: 1e13 });
    expect(tooLarge.status).toBe(400);
    expect(await tooLarge.json()).toEqual({ error: moneyLimitError('price') });

    const patched = await data<HoldingTransaction>(
      await send('PATCH', `/api/investments/holding-transactions/${dividend.id}`, {
        price: 7.125,
      }),
    );
    expect(patched.price).toBe(7.13);
  });

  test('a buy turned into a dividend has its amount rounded to cents', async () => {
    const holding = await createHolding({ currentPrice: 50 });
    const buy = await data<HoldingTransaction>(
      await createTransaction(holding.id, { type: 'buy', shares: 1, price: 123.4567 }),
    );
    const dividend = await data<HoldingTransaction>(
      await send('PATCH', `/api/investments/holding-transactions/${buy.id}`, {
        type: 'dividend',
        shares: null,
      }),
    );
    expect([dividend.type, dividend.shares, dividend.price]).toEqual(['dividend', null, 123.46]);
  });
});

describe('holding value', () => {
  test('is shares times the stored six-decimal price, rounded to cents once', async () => {
    const investor = await integration.signUp('investor');
    const holding = await createHolding({ currentPrice: 123.4567 }, investor);
    await data(
      await createTransaction(holding.id, { type: 'buy', shares: 3, price: 100 }, investor),
    );

    const userId = investor.user.id;
    const holdingRows = await db.select().from(holdings).where(eq(holdings.userId, userId));
    const transactionRows = await db
      .select()
      .from(holdingTransactions)
      .where(eq(holdingTransactions.userId, userId));
    const { portfolioTotal } = computeDerivedAllocations(
      new Map(),
      [],
      holdingRows,
      transactionRows,
      [],
      [],
      [],
      [],
    );
    expect(portfolioTotal).toBeCloseTo(370.3701, 10);
    // round_cents(3 × 123.4567); a price rounded to cents first would give 3 × 123.46 = 370.38.
    expect(roundMoney(portfolioTotal)).toBe(370.37);

    // The stored snapshot is a rounding point: the value is rounded there, once.
    await upsertCurrentNetWorthSnapshot(userId, new Date('2026-03-15T12:00:00Z'), {
      partnerId: null,
      rates: new Map(),
    });
    const [snapshot] = await db
      .select()
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, userId));
    expect(snapshot!.brokerage).toBe(370.37);
  });
});
