import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { and, eq, sql } from 'drizzle-orm';
import { LIST_PAGE_DEFAULT_LIMIT, LIST_PAGE_MAX_LIMIT } from '@quro/shared';
import { db } from '../db/client';
import {
  budgetCategories,
  budgetTransactions,
  debtPayments,
  debts,
  holdingPriceHistory,
  holdingTransactions,
  holdings,
  mortgageTransactions,
  mortgages,
  payslips,
  pensionPots,
  pensionStatementImportRows,
  pensionStatementImports,
  pensionTransactions,
  properties,
  propertyTransactions,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { encodeListCursor } from '../lib/listPage';
import { createIntegrationHelpers, insertPartnerLink, type AuthSession } from '../test/integration';

const integration = createIntegrationHelpers('list-pagination.integration.quro.test');
// Seeding twelve ledgers past the hard cap and one of 10k rows takes longer than the default.
setDefaultTimeout(60_000);

// More rows than the hard cap, on a handful of dates, inserted out of date order: paging must
// follow the explicit (key, tie) order, not insertion order, and survive many equal keys.
const ROWS = LIST_PAGE_MAX_LIMIT + 150;
const DATES = ['2025-03-04', '2025-01-15', '2025-03-04', '2025-02-01', '2025-01-15'];
const dateFor = (index: number) => DATES[index % DATES.length]!;
const range = (count: number) => Array.from({ length: count }, (_, index) => index);

type Row = { id: number; key: string | number; tie: number };
type PageBody = { data?: Array<{ id: number }>; nextCursor?: string | null; error?: string };

type LedgerCase = {
  name: string;
  path: string;
  direction: 'asc' | 'desc';
  rows: Row[];
};

let owner: AuthSession;
let stranger: AuthSession;
const ledgers: LedgerCase[] = [];
const owned = {
  savingsAccountId: 0,
  holdingIds: [] as number[],
  importId: 0,
  pensionPotId: 0,
  payslipGrossByYear: new Map<number, number>(),
};

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(path, 'http://quro.local');
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return `${url.pathname}${url.search}`;
}

async function getPage(
  session: AuthSession,
  path: string,
  params: Record<string, string | number | undefined> = {},
) {
  const response = await integration.request(withQuery(path, params), { cookie: session.cookie });
  return { status: response.status, body: (await response.json()) as PageBody };
}

async function traverse(session: AuthSession, path: string, limit?: number) {
  const ids: number[] = [];
  const pageSizes: number[] = [];
  let cursor: string | undefined;
  for (;;) {
    const { status, body } = await getPage(session, path, { limit, cursor });
    expect(status).toBe(200);
    pageSizes.push(body.data!.length);
    ids.push(...body.data!.map((row) => row.id));
    if (!body.nextCursor) return { ids, pageSizes };
    cursor = body.nextCursor;
  }
}

function expectedIds(ledger: Pick<LedgerCase, 'rows' | 'direction'>): number[] {
  const sign = ledger.direction === 'asc' ? 1 : -1;
  return [...ledger.rows]
    .sort((left, right) => {
      if (left.key !== right.key) return (left.key < right.key ? -1 : 1) * sign;
      return (left.tie - right.tie) * sign;
    })
    .map((row) => row.id);
}

async function seedSavings(userId: number) {
  const [account] = await db
    .insert(savingsAccounts)
    .values({
      userId,
      name: 'Paged savings',
      bank: 'Synthetic Bank',
      balance: 0,
      currency: 'EUR',
      interestRate: 0,
      accountType: 'Easy Access',
    })
    .returning();
  const rows = await db
    .insert(savingsTransactions)
    .values(
      range(ROWS).map((index) => ({
        userId,
        accountId: account!.id,
        type: 'deposit',
        amount: index + 1,
        date: dateFor(index),
      })),
    )
    .returning();
  owned.savingsAccountId = account!.id;
  ledgers.push({
    name: 'savings transactions',
    path: `/api/savings/transactions?accountId=${account!.id}`,
    direction: 'asc',
    rows: rows.map((row) => ({ id: row.id, key: row.date, tie: row.id })),
  });
}

async function seedInvestments(userId: number) {
  const created = await db
    .insert(holdings)
    .values(
      ['C', 'B', 'A'].map((ticker) => ({
        userId,
        name: `Paged ${ticker}`,
        ticker,
        currentPrice: 10,
        currency: 'EUR' as const,
        sector: 'Synthetic',
      })),
    )
    .returning();
  owned.holdingIds = created.map((holding) => holding.id);
  const holdingTxns = await db
    .insert(holdingTransactions)
    .values(
      range(ROWS).map((index) => ({
        userId,
        holdingId: created[index % created.length]!.id,
        type: 'buy',
        shares: 1,
        price: 10,
        date: dateFor(index),
      })),
    )
    .returning();
  ledgers.push({
    name: 'holding transactions',
    path: '/api/investments/holding-transactions',
    direction: 'asc',
    rows: holdingTxns.map((row) => ({ id: row.id, key: row.date, tie: row.id })),
  });

  // (holding, day) is unique; holdings were created in reverse ticker order, so within one day
  // the insertion order differs from the holding-id order the list uses.
  const days = Math.ceil(ROWS / created.length);
  const prices = await db
    .insert(holdingPriceHistory)
    .values(
      range(days).flatMap((day) =>
        [...created].reverse().map((holding) => ({
          userId,
          holdingId: holding.id,
          eodDate: new Date(Date.UTC(2020, 0, 1 + day)).toISOString().slice(0, 10),
          closePrice: 10 + day,
          priceCurrency: 'EUR',
        })),
      ),
    )
    .returning();
  ledgers.push({
    name: 'holding price history',
    path: `/api/investments/holding-price-history?from=1900-01-01&holdingIds=${owned.holdingIds.join(',')}`,
    direction: 'asc',
    rows: prices.map((row) => ({ id: row.id, key: row.eodDate, tie: row.holdingId })),
  });

  const [property] = await db
    .insert(properties)
    .values({
      userId,
      address: 'Paged Street 1',
      propertyType: 'Investment',
      purchasePrice: 100000,
      currentValue: 120000,
      mortgage: 0,
      monthlyRent: 0,
      currency: 'EUR',
    })
    .returning();
  const propertyTxns = await db
    .insert(propertyTransactions)
    .values(
      range(ROWS).map((index) => ({
        userId,
        propertyId: property!.id,
        type: 'expense',
        amount: 5,
        date: dateFor(index),
      })),
    )
    .returning();
  ledgers.push({
    name: 'property transactions',
    path: `/api/investments/property-transactions?propertyId=${property!.id}`,
    direction: 'asc',
    rows: propertyTxns.map((row) => ({ id: row.id, key: row.date, tie: row.id })),
  });
}

async function seedMortgage(userId: number) {
  const [mortgage] = await db
    .insert(mortgages)
    .values({
      userId,
      propertyAddress: 'Paged Street 1',
      lender: 'Synthetic Bank',
      currency: 'EUR',
      originalAmount: 100000,
      outstandingBalance: 90000,
      propertyValue: 120000,
      monthlyPayment: 500,
      interestRate: 3,
      rateType: 'Fixed',
      termYears: 30,
      startDate: '2020-01-01',
      endDate: '2050-01-01',
    })
    .returning();
  const rows = await db
    .insert(mortgageTransactions)
    .values(
      range(ROWS).map((index) => ({
        userId,
        mortgageId: mortgage!.id,
        type: 'repayment',
        amount: 500,
        date: dateFor(index),
      })),
    )
    .returning();
  ledgers.push({
    name: 'mortgage transactions',
    path: `/api/mortgages/transactions?mortgageId=${mortgage!.id}`,
    direction: 'asc',
    rows: rows.map((row) => ({ id: row.id, key: row.date, tie: row.id })),
  });
}

async function seedPensions(userId: number) {
  const [pot] = await db
    .insert(pensionPots)
    .values({
      userId,
      name: 'Paged pension',
      provider: 'Synthetic Provider',
      type: 'Workplace',
      balance: 0,
      currency: 'EUR',
      employeeMonthly: 0,
      employerMonthly: 0,
    })
    .returning();
  owned.pensionPotId = pot!.id;
  const rows = await db
    .insert(pensionTransactions)
    .values(
      range(ROWS).map((index) => {
        // Every tenth row has no statement, so the documents list filters inside the query.
        const document =
          index % 10 === 0
            ? {}
            : {
                documentStorageKey: `synthetic/pension/${index}.pdf`,
                documentFileName: `statement-${index}.pdf`,
                documentSizeBytes: 100,
                documentUploadedAt: new Date('2025-04-01T00:00:00Z'),
              };
        return {
          userId,
          potId: pot!.id,
          type: 'contribution',
          amount: 100,
          date: dateFor(index),
          ...document,
        };
      }),
    )
    .returning();
  ledgers.push({
    name: 'pension transactions',
    path: `/api/pensions/transactions?potId=${pot!.id}`,
    direction: 'asc',
    rows: rows.map((row) => ({ id: row.id, key: row.date, tie: row.id })),
  });
  ledgers.push({
    name: 'pension statement documents',
    path: `/api/pensions/documents?potId=${pot!.id}`,
    direction: 'asc',
    rows: rows
      .filter((row) => row.documentStorageKey !== null)
      .map((row) => ({ id: row.id, key: row.date, tie: row.id })),
  });

  const [statementImport] = await db
    .insert(pensionStatementImports)
    .values({
      userId,
      potId: pot!.id,
      status: 'ready_for_review',
      storageKey: `synthetic/imports/${crypto.randomUUID()}.pdf`,
      fileName: 'statement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      fileHashSha256: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  owned.importId = statementImport!.id;
  // Positions repeat so the id has to break ties in statement order.
  const importRows = await db
    .insert(pensionStatementImportRows)
    .values(
      range(ROWS).map((index) => ({
        importId: statementImport!.id,
        rowOrder: (index * 7) % 400,
        type: 'contribution',
        amount: 1,
        date: '2025-01-01',
      })),
    )
    .returning();
  ledgers.push({
    name: 'pension import rows',
    path: `/api/pensions/imports/${statementImport!.id}/rows`,
    direction: 'asc',
    rows: importRows.map((row) => ({ id: row.id, key: row.rowOrder, tie: row.id })),
  });
}

async function seedDebts(userId: number) {
  const [debt] = await db
    .insert(debts)
    .values({
      userId,
      name: 'Paged loan',
      type: 'personal_loan',
      lender: 'Synthetic Bank',
      originalAmount: 10000,
      remainingBalance: 5000,
      currency: 'EUR',
      interestRate: 5,
      monthlyPayment: 100,
      startDate: '2024-01-01',
      color: '#000000',
      emoji: '💳',
    })
    .returning();
  const rows = await db
    .insert(debtPayments)
    .values(
      range(ROWS).map((index) => ({
        userId,
        debtId: debt!.id,
        date: dateFor(index),
        amount: 10,
        principal: 8,
        interest: 2,
      })),
    )
    .returning();
  const ledgerRows = rows.map((row) => ({ id: row.id, key: row.date, tie: row.id }));
  ledgers.push({
    name: 'debt payments',
    path: '/api/debts/payments',
    direction: 'asc',
    rows: ledgerRows,
  });
  ledgers.push({
    name: 'debt payments for one debt',
    path: `/api/debts/payments?debtId=${debt!.id}`,
    direction: 'asc',
    rows: ledgerRows,
  });
}

async function seedPayslips(userId: number) {
  const rows = await db
    .insert(payslips)
    .values(
      range(ROWS).map((index) => ({
        userId,
        month: 'Synthetic',
        date: index % 2 === 0 ? dateFor(index) : `2024-0${(index % 9) + 1}-28`,
        gross: 1000 + (index % 13),
        tax: 200,
        pension: 50,
        net: 750,
        bonus: index % 50 === 0 ? 300 : null,
        currency: 'EUR' as const,
      })),
    )
    .returning();
  for (const row of rows) {
    const year = Number(row.date.slice(0, 4));
    const gross = Number(row.gross) + Number(row.bonus ?? 0);
    owned.payslipGrossByYear.set(year, (owned.payslipGrossByYear.get(year) ?? 0) + gross);
  }
  ledgers.push({
    name: 'payslips',
    path: '/api/salary/payslips',
    direction: 'asc',
    rows: rows.map((row) => ({ id: row.id, key: row.date, tie: row.id })),
  });
}

async function seedBudget(userId: number) {
  const [category] = await db
    .insert(budgetCategories)
    .values({ userId, name: 'Paged groceries', budgeted: 100, spent: 0, month: 'Mar', year: 2025 })
    .returning();
  const inMonth = ['2025-03-02', '2025-03-01', '2025-03-31', '2025-03-01'];
  const rows = await db
    .insert(budgetTransactions)
    .values(
      range(ROWS + 5).map((index) => ({
        userId,
        categoryId: category!.id,
        description: `Paged ${index}`,
        amount: 1,
        // The last five rows fall outside the March window.
        date: index < ROWS ? inMonth[index % inMonth.length]! : '2025-04-01',
        merchant: 'Synthetic Shop',
      })),
    )
    .returning();
  ledgers.push({
    name: 'budget transactions in a month (newest first)',
    path: '/api/budget/transactions?month=Mar&year=2025',
    direction: 'desc',
    rows: rows
      .filter((row) => row.date.startsWith('2025-03'))
      .map((row) => ({ id: row.id, key: row.date, tie: row.id })),
  });
}

beforeAll(async () => {
  await integration.cleanup();
  owner = await integration.signUp('owner');
  stranger = await integration.signUp('stranger');
  await seedSavings(owner.user.id);
  await seedInvestments(owner.user.id);
  await seedMortgage(owner.user.id);
  await seedPensions(owner.user.id);
  await seedDebts(owner.user.id);
  await seedPayslips(owner.user.id);
  await seedBudget(owner.user.id);
  await db.insert(savingsAccounts).values({
    userId: stranger.user.id,
    name: 'Stranger savings',
    bank: 'Synthetic Bank',
    balance: 0,
    currency: 'EUR',
    interestRate: 0,
    accountType: 'Easy Access',
  });
});

afterAll(() => integration.cleanup());

describe('every ledger list is bounded, ordered and complete', () => {
  test('the fixture holds more rows than the hard cap on every ledger', () => {
    expect(ledgers).toHaveLength(12);
    for (const ledger of ledgers) expect(ledger.rows.length).toBeGreaterThan(LIST_PAGE_MAX_LIMIT);
  });

  for (const name of [
    'savings transactions',
    'holding transactions',
    'holding price history',
    'property transactions',
    'mortgage transactions',
    'pension transactions',
    'pension statement documents',
    'pension import rows',
    'debt payments',
    'debt payments for one debt',
    'payslips',
    'budget transactions in a month (newest first)',
  ]) {
    describe(name, () => {
      const ledger = () => ledgers.find((entry) => entry.name === name)!;

      test('a request without a limit returns the default page and a cursor', async () => {
        const { status, body } = await getPage(owner, ledger().path);
        expect(status).toBe(200);
        expect(body.data).toHaveLength(LIST_PAGE_DEFAULT_LIMIT);
        expect(body.data!.map((row) => row.id)).toEqual(
          expectedIds(ledger()).slice(0, LIST_PAGE_DEFAULT_LIMIT),
        );
        expect(typeof body.nextCursor).toBe('string');
      });

      test('a larger limit is held to the hard cap', async () => {
        const { status, body } = await getPage(owner, ledger().path, { limit: 1_000_000 });
        expect(status).toBe(200);
        expect(body.data).toHaveLength(LIST_PAGE_MAX_LIMIT);
        expect(typeof body.nextCursor).toBe('string');
      });

      test('following the cursors returns every row once, in the explicit order', async () => {
        const { ids, pageSizes } = await traverse(owner, ledger().path, 333);
        expect(ids).toEqual(expectedIds(ledger()));
        expect(new Set(ids).size).toBe(ids.length);
        expect(Math.max(...pageSizes)).toBeLessThanOrEqual(333);
      });
    });
  }
});

describe('cursor and limit validation', () => {
  const dated = () => ledgers.find((entry) => entry.name === 'savings transactions')!.path;
  const ordered = () => `/api/pensions/imports/${owned.importId}/rows`;
  const raw = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

  test.each([
    ['garbage', 'not a cursor!'],
    ['empty', ''],
    ['a shape the server never issues', raw('{"key":"2025-03-04","tie":1}')],
    ['an impossible date', raw('["2025-02-30",1]')],
    ['a negative tie', raw('["2025-03-04",-1]')],
    ['an integer key on a dated list', encodeListCursor({ key: 3, tie: 1 })],
  ])('a dated list answers 400 for a cursor that is %s', async (_label, cursor) => {
    const { status, body } = await getPage(owner, dated(), { cursor });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'Invalid cursor' });
  });

  test('an integer-ordered list rejects a dated cursor', async () => {
    const cursor = encodeListCursor({ key: '2025-03-04', tie: 1 });
    const { status, body } = await getPage(owner, ordered(), { cursor });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'Invalid cursor' });
  });

  test.each(['0', '-5', 'ten', '2.5', ''])('limit %p answers 400', async (limit) => {
    for (const path of [dated(), ordered(), '/api/salary/payslips']) {
      const { status, body } = await getPage(owner, path, { limit });
      expect(status).toBe(400);
      expect(body).toEqual({ error: 'Invalid limit' });
    }
  });

  test('a cursor past the last row returns an empty last page', async () => {
    const cursor = encodeListCursor({ key: '9999-12-31', tie: 2_147_483_647 });
    const { status, body } = await getPage(owner, dated(), { cursor });
    expect(status).toBe(200);
    expect(body).toEqual({ data: [], nextCursor: null });
  });
});

describe('price history', () => {
  test('requires a from date', async () => {
    const response = await integration.request(
      `/api/investments/holding-price-history?holdingIds=${owned.holdingIds.join(',')}`,
      { cookie: owner.cookie },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'A from date is required. Use YYYY-MM-DD format.',
    });
  });

  test('pages a wide range instead of returning it at once', async () => {
    const { status, body } = await getPage(owner, '/api/investments/holding-price-history', {
      from: '0001-01-01',
      to: '9999-12-31',
      limit: 1_000_000,
    });
    expect(status).toBe(200);
    expect(body.data).toHaveLength(LIST_PAGE_MAX_LIMIT);
    expect(body.nextCursor).toBeString();
  });
});

describe('cursors and parent ids do not cross accounts', () => {
  test("another user's cursor only positions within that user's own rows", async () => {
    const { body: ownerPage } = await getPage(owner, '/api/savings/transactions', { limit: 5 });
    const ownerIds = new Set(
      ledgers.find((entry) => entry.name === 'savings transactions')!.rows.map((row) => row.id),
    );
    const strangerAccount = await db
      .select({ id: savingsAccounts.id })
      .from(savingsAccounts)
      .where(eq(savingsAccounts.userId, stranger.user.id));
    await db.insert(savingsTransactions).values(
      DATES.map((date, index) => ({
        userId: stranger.user.id,
        accountId: strangerAccount[0]!.id,
        type: 'deposit',
        amount: index + 1,
        date,
      })),
    );

    const { status, body } = await getPage(stranger, '/api/savings/transactions', {
      cursor: ownerPage.nextCursor!,
    });
    expect(status).toBe(200);
    expect(body.data!.length).toBeGreaterThan(0);
    expect(body.data!.some((row) => ownerIds.has(row.id))).toBe(false);
  });

  const datedCursor = encodeListCursor({ key: '2025-01-15', tie: 1 });
  test.each([
    ['savings account', () => `/api/savings/transactions?accountId=${owned.savingsAccountId}`],
    ['holding', () => `/api/investments/holding-transactions?holdingId=${owned.holdingIds[0]}`],
    ['pension pot', () => `/api/pensions/transactions?potId=${owned.pensionPotId}`],
    ['pension pot documents', () => `/api/pensions/documents?potId=${owned.pensionPotId}`],
    [
      'holding prices',
      () =>
        `/api/investments/holding-price-history?from=1900-01-01&holdingIds=${owned.holdingIds[0]}`,
    ],
  ])("another user's %s yields no row on any page", async (_label, path) => {
    for (const params of [{}, { limit: 1000 }, { cursor: datedCursor }]) {
      const { status, body } = await getPage(stranger, path(), params);
      // Ledgers that check the parent answer 404; the others answer with an empty list.
      if (status === 404) expect(body.data).toBeUndefined();
      else expect({ status, body }).toEqual({ status: 200, body: { data: [], nextCursor: null } });
    }
  });

  test("another user's statement import rows are not found on any page", async () => {
    const cursor = encodeListCursor({ key: 0, tie: 1 });
    for (const params of [{}, { limit: 1000 }, { cursor }]) {
      const { status, body } = await getPage(
        stranger,
        `/api/pensions/imports/${owned.importId}/rows`,
        params,
      );
      expect({ status, body }).toEqual({ status: 404, body: { error: 'Import not found' } });
    }
  });
});

describe('concurrent writes during a traversal', () => {
  test('rows written between pages never cause a skipped or repeated row', async () => {
    const ledger = ledgers.find((entry) => entry.name === 'savings transactions')!;
    const path = ledger.path;
    const ids: number[] = [];
    const first = await getPage(owner, path, { limit: 400 });
    ids.push(...first.body.data!.map((row) => row.id));

    // One row lands before the cursor (an earlier date), one after it (a later date).
    const [before, after] = await db
      .insert(savingsTransactions)
      .values([
        {
          userId: owner.user.id,
          accountId: owned.savingsAccountId,
          type: 'deposit',
          amount: 1,
          date: '2000-01-01',
        },
        {
          userId: owner.user.id,
          accountId: owned.savingsAccountId,
          type: 'deposit',
          amount: 1,
          date: '2099-01-01',
        },
      ])
      .returning();

    let cursor = first.body.nextCursor;
    while (cursor) {
      const page = await getPage(owner, path, { limit: 400, cursor });
      ids.push(...page.body.data!.map((row) => row.id));
      cursor = page.body.nextCursor;
    }

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id !== after!.id)).toEqual(expectedIds(ledger));
    expect(ids.at(-1)).toBe(after!.id);
    expect(ids).not.toContain(before!.id);

    await db
      .delete(savingsTransactions)
      .where(sql`${savingsTransactions.id} in (${before!.id}, ${after!.id})`);
  });
});

describe('totals cover the whole ledger, not the visible page', () => {
  test('salary history sums every payslip', async () => {
    const response = await integration.request('/api/salary/history', { cookie: owner.cookie });
    const body = (await response.json()) as {
      data: Array<{ year: number; annualSalary: string; currency: string }>;
    };
    expect(response.status).toBe(200);
    expect(
      body.data.map((entry) => [entry.year, Number(entry.annualSalary)] as const).sort(),
    ).toEqual([...owned.payslipGrossByYear.entries()].sort());
  });

  test('a traversal of the 10k-row ledger adds up to the stored total', async () => {
    const [account] = await db
      .insert(savingsAccounts)
      .values({
        userId: owner.user.id,
        name: 'Ten thousand rows',
        bank: 'Synthetic Bank',
        balance: 0,
        currency: 'EUR',
        interestRate: 0,
        accountType: 'Easy Access',
      })
      .returning();
    for (let start = 0; start < 10_000; start += 2_500) {
      await db.insert(savingsTransactions).values(
        range(2_500).map((offset) => ({
          userId: owner.user.id,
          accountId: account!.id,
          type: 'deposit',
          amount: ((start + offset) % 997) + 0.01,
          date: new Date(Date.UTC(2015, 0, 1 + ((start + offset) % 3650)))
            .toISOString()
            .slice(0, 10),
        })),
      );
    }

    const path = `/api/savings/transactions?accountId=${account!.id}`;
    const ids: number[] = [];
    let total = 0;
    let pages = 0;
    let cursor: string | null | undefined;
    do {
      const { status, body } = await getPage(owner, path, {
        limit: LIST_PAGE_MAX_LIMIT,
        cursor: cursor ?? undefined,
      });
      expect(status).toBe(200);
      const data = body.data as unknown as Array<{ id: number; amount: number }>;
      ids.push(...data.map((row) => row.id));
      total += data.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
      pages += 1;
      cursor = body.nextCursor;
    } while (cursor);

    const [stored] = await db
      .select({
        count: sql<number>`count(*)::int`,
        cents: sql<number>`(sum(${savingsTransactions.amount}) * 100)::bigint`,
      })
      .from(savingsTransactions)
      .where(
        and(
          eq(savingsTransactions.userId, owner.user.id),
          eq(savingsTransactions.accountId, account!.id),
        ),
      );
    expect(pages).toBe(10);
    expect(ids).toHaveLength(10_000);
    expect(new Set(ids).size).toBe(10_000);
    expect(ids.length).toBe(Number(stored!.count));
    expect(total).toBe(Number(stored!.cents));
  });
});

describe('a partner pages through joint rows only', () => {
  test("joint ledger rows page completely; the owner's private ledger stays hidden", async () => {
    // Runs last: linking a partner widens what the owner's own lists contain.
    const partner = await integration.signUp('partner');
    await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
    const [joint] = await db
      .insert(savingsAccounts)
      .values({
        userId: owner.user.id,
        name: 'Joint paged savings',
        bank: 'Synthetic Bank',
        balance: 0,
        currency: 'EUR',
        interestRate: 0,
        accountType: 'Easy Access',
        isJoint: true,
      })
      .returning();
    const rows = await db
      .insert(savingsTransactions)
      .values(
        range(LIST_PAGE_MAX_LIMIT + 20).map((index) => ({
          userId: owner.user.id,
          accountId: joint!.id,
          type: 'deposit',
          amount: 1,
          date: dateFor(index),
        })),
      )
      .returning();
    const expected = expectedIds({
      direction: 'asc',
      rows: rows.map((row) => ({ id: row.id, key: row.date, tie: row.id })),
    });

    const byAccount = await traverse(
      partner,
      `/api/savings/transactions?accountId=${joint!.id}`,
      300,
    );
    expect(byAccount.ids).toEqual(expected);
    // Without a parent filter the partner sees the joint account's rows and nothing private.
    const all = await traverse(partner, '/api/savings/transactions', 300);
    expect(all.ids).toEqual(expected);

    const privateAccount = await getPage(
      partner,
      `/api/savings/transactions?accountId=${owned.savingsAccountId}`,
    );
    expect(privateAccount.status).toBe(404);
  });
});
