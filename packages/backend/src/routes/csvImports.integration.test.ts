import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { CSV_IMPORT_LIMITS, sumMoney, type CsvImportMapping } from '@quro/shared';
import { db } from '../db/client';
import {
  budgetCategories,
  budgetTransactions,
  csvImports,
  currencyRates,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { invalidateCurrentCurrencyRateCache } from '../lib/currencyRateSync';
import { FIXTURE_RATES_TO_EUR, useFixtureCurrencyRates } from '../test/currencyRates';
import { createIntegrationHelpers, insertPartnerLink, type AuthSession } from '../test/integration';

// Reviewed CSV import: dry-run preview without writes, staging of approved rows, bounded commit
// batches, idempotent re-runs, cancellation, concurrency, reconciliation and ownership.

const integration = createIntegrationHelpers('csv-import.integration.quro.test');

let owner: AuthSession;
let partner: AuthSession;
let stranger: AuthSession;

beforeAll(async () => {
  await integration.cleanup();
  await useFixtureCurrencyRates('csv-import.integration');
  owner = await integration.signUp('owner');
  partner = await integration.signUp('partner');
  stranger = await integration.signUp('stranger');
  await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
});
afterAll(async () => {
  await integration.cleanup();
  await useFixtureCurrencyRates('csv-import.integration');
  invalidateCurrentCurrencyRateCache();
});

function call(session: AuthSession, method: string, path: string, json?: unknown) {
  return integration.request(path, { method, cookie: session.cookie, json });
}

async function body<T>(response: Response, status = 200): Promise<T> {
  const text = await response.text();
  if (response.status !== status) throw new Error(`${response.status} ${text}`);
  return (JSON.parse(text) as { data: T }).data;
}

const mapping = (overrides: Partial<CsvImportMapping> = {}): CsvImportMapping => ({
  source: 'Synthetic bank',
  delimiter: 'auto',
  columns: { date: 'Date', amount: 'Amount', description: 'Description' },
  dateFormat: 'YYYY-MM-DD',
  decimalSeparator: '.',
  defaultCurrency: 'EUR',
  invertSign: false,
  defaultCategory: 'Uncategorised',
  ...overrides,
});

type Line = [date: string, amount: string, description: string, extra?: string];
const csvOf = (lines: Line[], header = 'Date,Amount,Description') =>
  [header, ...lines.map((line) => line.filter((v) => v !== undefined).join(','))].join('\n');

/** `count` distinct deposits of 1.10 on consecutive days. */
const manyLines = (count: number): Line[] =>
  Array.from({ length: count }, (_, i) => [
    `2026-02-${String((i % 27) + 1).padStart(2, '0')}`,
    '1.10',
    `Row ${i}`,
  ]);

async function createAccount(session = owner, overrides: Record<string, unknown> = {}) {
  return body<{ id: number }>(
    await call(session, 'POST', '/api/savings/accounts', {
      name: 'Import target',
      bank: 'Synthetic Bank',
      balance: 1000,
      currency: 'EUR',
      interestRate: 1,
      accountType: 'Easy Access',
      color: '#0ea5e9',
      emoji: 'S',
      ...overrides,
    }),
    201,
  );
}

async function accountBalance(id: number): Promise<number> {
  const [row] = await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, id));
  return row!.balance;
}

const transactionsOf = (accountId: number) =>
  db.select().from(savingsTransactions).where(eq(savingsTransactions.accountId, accountId));

type Preview = {
  fileSha256: string;
  summary: { ready: number; duplicate: number; possibleDuplicate: number; error: number };
  rows: { rowNumber: number; status: string; reason: string | null }[];
  reconciliation: { difference: number } | null;
};
type Progress = {
  id: number;
  status: string;
  total: number;
  committed: number;
  duplicate: number;
  failed: number;
  pending: number;
  reconciliation: { difference: number; ledgerBalance: number; adjustmentApplied: boolean } | null;
};

const savingsRequest = (accountId: number, csv: string, extra: Record<string, unknown> = {}) => ({
  kind: 'savings',
  accountId,
  csv,
  mapping: mapping(),
  ...extra,
});

async function preview(accountId: number, csv: string, extra: Record<string, unknown> = {}) {
  return body<Preview>(
    await call(owner, 'POST', '/api/imports/csv/preview', savingsRequest(accountId, csv, extra)),
  );
}

async function stage(
  accountId: number,
  csv: string,
  extra: Record<string, unknown> = {},
  session = owner,
): Promise<Progress> {
  const reviewed = await body<Preview>(
    await call(session, 'POST', '/api/imports/csv/preview', savingsRequest(accountId, csv, extra)),
  );
  return body<Progress>(
    await call(session, 'POST', '/api/imports/csv', {
      ...savingsRequest(accountId, csv, extra),
      fileSha256: reviewed.fileSha256,
      selectedRows: reviewed.rows.filter((r) => r.status === 'ready').map((r) => r.rowNumber),
    }),
    201,
  );
}

async function commitAll(id: number, session = owner): Promise<{ calls: number; last: Progress }> {
  let calls = 0;
  for (;;) {
    const progress = await body<Progress>(
      await call(session, 'POST', `/api/imports/csv/${id}/commit`),
    );
    calls += 1;
    if (progress.pending === 0 || progress.status !== 'staged') return { calls, last: progress };
  }
}

describe('headers', () => {
  test('reads the header, a sample and a column guess without a mapping', async () => {
    const csv = 'Boekingsdatum;Bedrag;Omschrijving;Saldo\n02-01-2026;-1,50;Koffie;10,00\n';
    const result = await body<{
      headers: string[];
      delimiter: string;
      rowCount: number;
      suggestion: Record<string, string>;
    }>(await call(owner, 'POST', '/api/imports/csv/headers', { csv }));
    expect(result.delimiter).toBe(';');
    expect(result.rowCount).toBe(1);
    expect(result.suggestion).toMatchObject({
      date: 'Boekingsdatum',
      amount: 'Bedrag',
      description: 'Omschrijving',
      balance: 'Saldo',
    });
    expect((await call(owner, 'POST', '/api/imports/csv/headers', { csv: '' })).status).toBe(400);
    expect(
      (await call(owner, 'POST', '/api/imports/csv/headers', { csv: 'A\n1', x: 1 })).status,
    ).toBe(400);
  });
});

describe('preview', () => {
  test('is a dry run: it classifies rows and writes nothing', async () => {
    const account = await createAccount();
    const before = await db.$count(csvImports);
    const csv = csvOf([
      ['2026-01-02', '-12.50', 'Coffee'],
      ['2026-01-03', '100.00', 'Salary'],
      ['bad', '1', 'Broken'],
    ]);
    const result = await preview(account.id, csv);
    expect(result.summary).toMatchObject({ ready: 2, error: 1 });
    expect(result.rows[2]).toMatchObject({
      status: 'error',
      reason: expect.stringContaining('date'),
    });
    expect(await db.$count(csvImports)).toBe(before);
    expect(await transactionsOf(account.id)).toHaveLength(0);
    expect(await accountBalance(account.id)).toBe(1000);
  });

  test('flags a lookalike of a manual entry as a possible duplicate', async () => {
    const account = await createAccount();
    await body(
      await call(owner, 'POST', '/api/savings/transactions', {
        accountId: account.id,
        type: 'withdrawal',
        amount: 12.5,
        date: '2026-01-02',
      }),
      201,
    );
    const result = await preview(account.id, csvOf([['2026-01-02', '-12.50', 'Coffee']]));
    expect(result.rows[0]!.status).toBe('possibleDuplicate');
  });

  test('refuses ambiguous dates, malformed files and unknown columns with a 400', async () => {
    const account = await createAccount();
    const ask = (csv: string, overrides: Partial<CsvImportMapping> = {}) =>
      call(
        owner,
        'POST',
        '/api/imports/csv/preview',
        savingsRequest(account.id, csv, { mapping: mapping({ dateFormat: 'auto', ...overrides }) }),
      );
    const ambiguous = await ask(
      csvOf([
        ['03/04/2026', '1', 'A'],
        ['05/06/2026', '2', 'B'],
      ]),
    );
    expect(ambiguous.status).toBe(400);
    expect(await ambiguous.text()).toContain('choose the date format');
    expect((await ask('Date,Amount,Description\n2026-01-01,1,"open')).status).toBe(400);
    expect((await ask('', {})).status).toBe(400);
    const missing = await ask(csvOf([['2026-01-01', '1', 'A']]), {
      columns: { date: 'Nope', amount: 'Amount', description: 'Description' },
    });
    expect(missing.status).toBe(400);
  });

  test('refuses a file over the size limit and one with too many rows', async () => {
    const account = await createAccount();
    const big = 'Date,Amount,Description\n' + 'x'.repeat(CSV_IMPORT_LIMITS.maxBytes + 1);
    expect(
      (await call(owner, 'POST', '/api/imports/csv/preview', savingsRequest(account.id, big)))
        .status,
    ).toBe(400);
    const tooMany = csvOf(manyLines(CSV_IMPORT_LIMITS.maxRows + 1));
    const response = await call(
      owner,
      'POST',
      '/api/imports/csv/preview',
      savingsRequest(account.id, tooMany),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('more than 5000 rows');
  });

  test('reads a large file within the bounds', async () => {
    const account = await createAccount();
    const csv = csvOf(
      manyLines(CSV_IMPORT_LIMITS.maxRows).map((l, i) => [l[0], l[1], `Distinct ${i}`]),
    );
    const result = await preview(account.id, csv);
    expect(result.summary.ready).toBe(CSV_IMPORT_LIMITS.maxRows);
  });

  test('mixed currencies in a savings file are refused per row, never converted', async () => {
    const account = await createAccount();
    const csv = csvOf(
      [
        ['2026-01-02', '10', 'Euro', 'EUR'],
        ['2026-01-03', '10', 'Pound', 'GBP'],
      ],
      'Date,Amount,Description,Currency',
    );
    const result = await preview(account.id, csv, {
      mapping: mapping({
        columns: {
          date: 'Date',
          amount: 'Amount',
          description: 'Description',
          currency: 'Currency',
        },
      }),
    });
    expect(result.rows.map((r) => r.status)).toEqual(['ready', 'error']);
    expect(result.rows[1]!.reason).toContain('GBP');
  });
});

describe('commit', () => {
  test('writes approved rows in bounded batches and the balance matches the ledger effect', async () => {
    const account = await createAccount();
    const lines = manyLines(450);
    const staged = await stage(account.id, csvOf(lines));
    expect(staged).toMatchObject({ status: 'staged', total: 450, pending: 450, committed: 0 });
    expect(await transactionsOf(account.id)).toHaveLength(0);

    const { calls, last } = await commitAll(staged.id);
    expect(calls).toBe(Math.ceil(450 / CSV_IMPORT_LIMITS.commitBatchRows));
    expect(last).toMatchObject({ status: 'committed', committed: 450, pending: 0 });
    const rows = await transactionsOf(account.id);
    expect(rows).toHaveLength(450);
    expect(rows.every((r) => r.importId === staged.id && r.importSource === 'Synthetic bank')).toBe(
      true,
    );
    expect(rows.every((r) => r.externalId?.startsWith('h:'))).toBe(true);
    expect(await accountBalance(account.id)).toBe(sumMoney([1000, ...rows.map(() => 1.1)]));
  });

  test('signs: negative rows are withdrawals, positive rows deposits', async () => {
    const account = await createAccount();
    const staged = await stage(
      account.id,
      csvOf([
        ['2026-01-02', '-12.50', 'Out'],
        ['2026-01-03', '100.25', 'In'],
      ]),
    );
    await commitAll(staged.id);
    const rows = await transactionsOf(account.id);
    expect(rows.map((r) => [r.type, r.amount]).sort()).toEqual([
      ['deposit', 100.25],
      ['withdrawal', 12.5],
    ]);
    expect(await accountBalance(account.id)).toBe(1087.75);
  });

  test('importing the same file again finds every row already imported and stages nothing', async () => {
    const account = await createAccount();
    const csv = csvOf(manyLines(30));
    await commitAll((await stage(account.id, csv)).id);
    const again = await preview(account.id, csv);
    expect(again.summary).toMatchObject({ ready: 0, duplicate: 30 });
    const refused = await call(owner, 'POST', '/api/imports/csv', {
      ...savingsRequest(account.id, csv),
      fileSha256: again.fileSha256,
      selectedRows: [1, 2],
    });
    expect(refused.status).toBe(400);
    expect(await transactionsOf(account.id)).toHaveLength(30);
  });

  test('identical purchases in one file are kept; re-importing does not add them again', async () => {
    const account = await createAccount();
    const csv = csvOf([
      ['2026-01-02', '-3.00', 'Coffee'],
      ['2026-01-02', '-3.00', 'Coffee'],
    ]);
    await commitAll((await stage(account.id, csv)).id);
    expect(await transactionsOf(account.id)).toHaveLength(2);
    expect((await preview(account.id, csv)).summary.duplicate).toBe(2);
  });

  test('a bank id is the duplicate key across files', async () => {
    const account = await createAccount();
    const withId = mapping({
      columns: { date: 'Date', amount: 'Amount', description: 'Description', externalId: 'Id' },
    });
    const header = 'Date,Amount,Description,Id';
    const first = csvOf([['2026-01-02', '-3.00', 'Coffee', 'T-1']], header);
    await commitAll((await stage(account.id, first, { mapping: withId })).id);
    const second = csvOf([['2026-01-09', '-9.99', 'Reworded', 'T-1']], header);
    const result = await preview(account.id, second, { mapping: withId });
    expect(result.rows[0]).toMatchObject({ status: 'duplicate' });
  });

  test('the file must be the one that was previewed', async () => {
    const account = await createAccount();
    const csv = csvOf(manyLines(3));
    const reviewed = await preview(account.id, csv);
    const response = await call(owner, 'POST', '/api/imports/csv', {
      ...savingsRequest(account.id, csv + '\n2026-03-01,5,Added later'),
      fileSha256: reviewed.fileSha256,
      selectedRows: [1],
    });
    expect(response.status).toBe(409);
  });

  test('only the selected rows are staged, and a row the server calls an error cannot be selected', async () => {
    const account = await createAccount();
    const csv = csvOf([
      ['2026-01-02', '1', 'A'],
      ['bad', '1', 'B'],
      ['2026-01-04', '1', 'C'],
    ]);
    const reviewed = await preview(account.id, csv);
    const rejected = await call(owner, 'POST', '/api/imports/csv', {
      ...savingsRequest(account.id, csv),
      fileSha256: reviewed.fileSha256,
      selectedRows: [2],
    });
    expect(rejected.status).toBe(400);
    const staged = await body<Progress>(
      await call(owner, 'POST', '/api/imports/csv', {
        ...savingsRequest(account.id, csv),
        fileSha256: reviewed.fileSha256,
        selectedRows: [3],
      }),
      201,
    );
    expect(staged.total).toBe(1);
  });

  test('cancelling between batches keeps finished rows and writes nothing more', async () => {
    const account = await createAccount();
    const staged = await stage(account.id, csvOf(manyLines(450)));
    const first = await body<Progress>(
      await call(owner, 'POST', `/api/imports/csv/${staged.id}/commit`),
    );
    expect(first.committed).toBe(CSV_IMPORT_LIMITS.commitBatchRows);
    const cancelled = await body<Progress>(
      await call(owner, 'POST', `/api/imports/csv/${staged.id}/cancel`),
    );
    expect(cancelled.status).toBe('cancelled');
    const after = await body<Progress>(
      await call(owner, 'POST', `/api/imports/csv/${staged.id}/commit`),
    );
    expect(after).toMatchObject({
      status: 'cancelled',
      committed: CSV_IMPORT_LIMITS.commitBatchRows,
    });
    expect(await transactionsOf(account.id)).toHaveLength(CSV_IMPORT_LIMITS.commitBatchRows);
    expect(await accountBalance(account.id)).toBe(
      sumMoney([1000, ...Array.from({ length: CSV_IMPORT_LIMITS.commitBatchRows }, () => 1.1)]),
    );
    // Cancelling again is harmless; a finished import cannot be cancelled.
    expect((await call(owner, 'POST', `/api/imports/csv/${staged.id}/cancel`)).status).toBe(200);
  });

  test('resuming after a stop finishes the rest without repeating a row', async () => {
    const account = await createAccount();
    const staged = await stage(account.id, csvOf(manyLines(450)));
    await call(owner, 'POST', `/api/imports/csv/${staged.id}/commit`);
    // The client went away here. A later session continues.
    const { last } = await commitAll(staged.id);
    expect(last).toMatchObject({ status: 'committed', committed: 450 });
    expect(await transactionsOf(account.id)).toHaveLength(450);
    const finished = await call(owner, 'POST', `/api/imports/csv/${staged.id}/cancel`);
    expect(finished.status).toBe(409);
    // Committing a finished import is a no-op.
    const again = await body<Progress>(
      await call(owner, 'POST', `/api/imports/csv/${staged.id}/commit`),
    );
    expect(again.committed).toBe(450);
    expect(await accountBalance(account.id)).toBe(
      sumMoney([1000, ...Array.from({ length: 450 }, () => 1.1)]),
    );
  });

  test('concurrent commits of one import write each row once', async () => {
    const account = await createAccount();
    const staged = await stage(account.id, csvOf(manyLines(300)));
    await Promise.all(Array.from({ length: 4 }, () => commitAll(staged.id)));
    expect(await transactionsOf(account.id)).toHaveLength(300);
    expect(await accountBalance(account.id)).toBe(
      sumMoney([1000, ...Array.from({ length: 300 }, () => 1.1)]),
    );
  });

  test('two imports of the same file committed at once write each row once', async () => {
    const account = await createAccount();
    const csv = csvOf(manyLines(250));
    const [a, b] = await Promise.all([stage(account.id, csv), stage(account.id, csv)]);
    const [first, second] = await Promise.all([commitAll(a.id), commitAll(b.id)]);
    expect(first.last.committed + second.last.committed).toBe(250);
    expect(first.last.duplicate + second.last.duplicate).toBe(250);
    expect(await transactionsOf(account.id)).toHaveLength(250);
    expect(await accountBalance(account.id)).toBe(
      sumMoney([1000, ...Array.from({ length: 250 }, () => 1.1)]),
    );
  });

  test('formula-like text is stored as the plain text it is', async () => {
    const account = await createAccount();
    const csv =
      'Date,Amount,Description\n2026-01-02,-1.00,"=HYPERLINK(""http://example.test"",""x"")"';
    const reviewed = await preview(account.id, csv);
    expect(reviewed.rows[0]!.status).toBe('ready');
    await commitAll((await stage(account.id, csv)).id);
    const [row] = await transactionsOf(account.id);
    expect(row!.note).toBe('=HYPERLINK("http://example.test","x")');
  });
});

describe('reconciliation', () => {
  const header = 'Date,Amount,Description,Balance';
  const statement = csvOf(
    [
      ['2026-01-02', '-12.50', 'Coffee', '987.50'],
      ['2026-01-03', '100.00', 'Salary', '1087.50'],
    ],
    header,
  );
  const withBalance = {
    mapping: mapping({
      columns: { date: 'Date', amount: 'Amount', description: 'Description', balance: 'Balance' },
    }),
  };

  test('shows the difference to the statement, then books one labelled adjustment', async () => {
    // The account starts 5.00 short of what the statement implies.
    const account = await createAccount(owner, { balance: 995 });
    const reviewed = await preview(account.id, statement, withBalance);
    expect(reviewed.reconciliation).toMatchObject({ difference: 5 });

    const staged = await stage(account.id, statement, withBalance);
    const { last } = await commitAll(staged.id);
    expect(last.reconciliation).toMatchObject({
      difference: 5,
      ledgerBalance: 1082.5,
      adjustmentApplied: false,
    });

    const stale = await call(owner, 'POST', `/api/imports/csv/${staged.id}/reconcile`, {
      difference: 4,
    });
    expect(stale.status).toBe(409);
    expect(await transactionsOf(account.id)).toHaveLength(2);

    const done = await body<Progress>(
      await call(owner, 'POST', `/api/imports/csv/${staged.id}/reconcile`, { difference: 5 }),
    );
    expect(done.reconciliation).toMatchObject({ difference: 0, adjustmentApplied: true });
    const adjustment = (await transactionsOf(account.id)).find(
      (r) => r.importSource === 'reconciliation',
    );
    expect(adjustment).toMatchObject({
      type: 'deposit',
      amount: 5,
      date: '2026-01-03',
      importId: staged.id,
    });
    expect(await accountBalance(account.id)).toBe(1087.5);

    const second = await call(owner, 'POST', `/api/imports/csv/${staged.id}/reconcile`, {
      difference: 5,
    });
    expect(second.status).toBe(409);
  });

  test('a balance booked after the statement date is left out of the comparison', async () => {
    const account = await createAccount(owner, { balance: 1000 });
    await body(
      await call(owner, 'POST', '/api/savings/transactions', {
        accountId: account.id,
        type: 'deposit',
        amount: 40,
        date: '2026-02-01',
      }),
      201,
    );
    // The balance today is 1040, but on 3 January the ledger stood at 1000.
    const reviewed = await preview(account.id, statement, withBalance);
    expect(reviewed.reconciliation).toMatchObject({ difference: 0, ledgerBalance: 1087.5 });
  });

  test('a closing balance can be entered when the file has none', async () => {
    const account = await createAccount(owner, { balance: 1000 });
    const csv = csvOf([['2026-01-02', '-10.00', 'Coffee']]);
    const reviewed = await preview(account.id, csv, {
      closingBalance: 985,
      closingDate: '2026-01-02',
    });
    expect(reviewed.reconciliation).toMatchObject({ difference: -5 });
    const half = await call(
      owner,
      'POST',
      '/api/imports/csv/preview',
      savingsRequest(account.id, csv, { closingBalance: 985 }),
    );
    expect(half.status).toBe(400);
  });
});

describe('budget imports', () => {
  const budgetMapping = (overrides: Partial<CsvImportMapping> = {}) =>
    mapping({
      columns: { date: 'Date', amount: 'Amount', description: 'Description', category: 'Category' },
      ...overrides,
    });
  const header = 'Date,Amount,Description,Category';

  async function stageBudget(csv: string, m = budgetMapping(), session = owner) {
    const request = { kind: 'budget', csv, mapping: m };
    const reviewed = await body<Preview>(
      await call(session, 'POST', '/api/imports/csv/preview', request),
    );
    return body<Progress>(
      await call(session, 'POST', '/api/imports/csv', {
        ...request,
        fileSha256: reviewed.fileSha256,
        selectedRows: reviewed.rows.filter((r) => r.status === 'ready').map((r) => r.rowNumber),
      }),
      201,
    );
  }

  test('creates the month category, adds spent once and skips income', async () => {
    const csv = csvOf(
      [
        ['2031-03-02', '-12.40', 'Bread', 'Groceries'],
        ['2031-03-09', '-7.60', 'Milk', 'Groceries'],
        ['2031-03-10', '50.00', 'Refund', 'Groceries'],
        ['2031-04-01', '-3.00', 'Bus', ''],
      ],
      header,
    );
    const staged = await stageBudget(csv);
    expect(staged.total).toBe(3);
    await commitAll(staged.id);
    const categories = await db
      .select()
      .from(budgetCategories)
      .where(and(eq(budgetCategories.userId, owner.user.id), eq(budgetCategories.year, 2031)));
    const spent = Object.fromEntries(categories.map((c) => [`${c.name}|${c.month}`, c.spent]));
    expect(spent).toEqual({ 'Groceries|Mar': 20, 'Uncategorised|Apr': 3 });
    const rows = await db
      .select()
      .from(budgetTransactions)
      .where(eq(budgetTransactions.importId, staged.id));
    expect(rows).toHaveLength(3);
    expect(
      rows.every(
        (r) => r.amount > 0 && r.currency === 'EUR' && r.importSource === 'Synthetic bank',
      ),
    ).toBe(true);
    // The same file again finds everything imported.
    const again = await body<Preview>(
      await call(owner, 'POST', '/api/imports/csv/preview', {
        kind: 'budget',
        csv,
        mapping: budgetMapping(),
      }),
    );
    expect(again.summary).toMatchObject({ ready: 0, duplicate: 3, skipped: 1 });
  });

  test('converts a foreign row once and keeps the native amount', async () => {
    const csv = csvOf([['2032-05-02', '-10.00', 'Pound shop', 'Misc']], header);
    const staged = await stageBudget(csv, budgetMapping({ defaultCurrency: 'GBP' }));
    await commitAll(staged.id);
    const [row] = await db
      .select()
      .from(budgetTransactions)
      .where(eq(budgetTransactions.importId, staged.id));
    expect(row).toMatchObject({ sourceAmount: 10, sourceCurrency: 'GBP', currency: 'EUR' });
    expect(row!.amount).toBe(Math.round(10 * FIXTURE_RATES_TO_EUR.GBP * 100) / 100);
  });

  test('a currency without a rate fails the row and never converts at one to one', async () => {
    await db.delete(currencyRates).where(eq(currencyRates.fromCurrency, 'CHF'));
    invalidateCurrentCurrencyRateCache();
    try {
      const csv = csvOf([['2033-05-02', '-10.00', 'Franc shop', 'Misc']], header);
      const staged = await stageBudget(csv, budgetMapping({ defaultCurrency: 'CHF' }));
      const { last } = await commitAll(staged.id);
      expect(last).toMatchObject({ failed: 1, committed: 0, status: 'committed' });
      expect(await db.$count(budgetTransactions, eq(budgetTransactions.importId, staged.id))).toBe(
        0,
      );
    } finally {
      await useFixtureCurrencyRates('csv-import.integration');
      invalidateCurrentCurrencyRateCache();
    }
  });

  test('concurrent commits of one budget import add the category total once', async () => {
    const lines: Line[] = Array.from({ length: 250 }, (_, i) => [
      `2034-06-${String((i % 27) + 1).padStart(2, '0')}`,
      '-1.10',
      `Item ${i}`,
      'Bulk',
    ]);
    const staged = await stageBudget(csvOf(lines, header));
    await Promise.all(Array.from({ length: 3 }, () => commitAll(staged.id)));
    const [category] = await db
      .select()
      .from(budgetCategories)
      .where(and(eq(budgetCategories.userId, owner.user.id), eq(budgetCategories.year, 2034)));
    expect(category!.spent).toBe(sumMoney(Array.from({ length: 250 }, () => 1.1)));
    expect(await db.$count(budgetTransactions, eq(budgetTransactions.importId, staged.id))).toBe(
      250,
    );
  });

  test('rejects an account on a budget import and a balance column', async () => {
    const csv = csvOf([['2031-03-02', '-1', 'x', 'y']], header);
    const withAccount = await call(owner, 'POST', '/api/imports/csv/preview', {
      kind: 'budget',
      accountId: 1,
      csv,
      mapping: budgetMapping(),
    });
    expect(withAccount.status).toBe(400);
  });
});

describe('ownership', () => {
  test('an account the caller cannot reach answers like one that does not exist', async () => {
    const strangerAccount = await createAccount(stranger);
    const csv = csvOf([['2026-01-02', '1', 'A']]);
    const missing = await call(
      owner,
      'POST',
      '/api/imports/csv/preview',
      savingsRequest(2_000_000, csv),
    );
    const foreign = await call(
      owner,
      'POST',
      '/api/imports/csv/preview',
      savingsRequest(strangerAccount.id, csv),
    );
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
  });

  test("a partner's private account is unreachable, their joint account is not", async () => {
    const privateAccount = await createAccount(partner);
    const jointAccount = await createAccount(partner, { isJoint: true });
    const csv = csvOf([['2026-01-02', '5', 'A']]);
    expect(
      (
        await call(
          owner,
          'POST',
          '/api/imports/csv/preview',
          savingsRequest(privateAccount.id, csv),
        )
      ).status,
    ).toBe(404);
    const staged = await stage(jointAccount.id, csv, {}, owner);
    await commitAll(staged.id);
    const [row] = await transactionsOf(jointAccount.id);
    // The row belongs to the account's owner, as for a manual entry; the importer is the owner's partner.
    expect(row!.userId).toBe(partner.user.id);
    expect(await accountBalance(jointAccount.id)).toBe(1005);
  });

  test("another user's import is invisible and cannot be committed, cancelled or reconciled", async () => {
    const account = await createAccount();
    const staged = await stage(account.id, csvOf(manyLines(3)));
    for (const [method, path] of [
      ['GET', `/api/imports/csv/${staged.id}`],
      ['GET', `/api/imports/csv/${staged.id}/rows`],
      ['POST', `/api/imports/csv/${staged.id}/commit`],
      ['POST', `/api/imports/csv/${staged.id}/cancel`],
    ] as const) {
      expect((await call(stranger, method, path)).status).toBe(404);
      expect((await call(partner, method, path)).status).toBe(404);
    }
    expect(
      (await call(stranger, 'POST', `/api/imports/csv/${staged.id}/reconcile`, { difference: 1 }))
        .status,
    ).toBe(404);
    const listed = await body<Progress[]>(await call(stranger, 'GET', '/api/imports/csv'));
    expect(listed.find((i) => i.id === staged.id)).toBeUndefined();
    expect(
      (await body<Progress>(await call(owner, 'GET', `/api/imports/csv/${staged.id}`))).id,
    ).toBe(staged.id);
  });

  test('ownership fields in a request are refused', async () => {
    const account = await createAccount();
    const csv = csvOf([['2026-01-02', '1', 'A']]);
    const forged = await call(owner, 'POST', '/api/imports/csv/preview', {
      ...savingsRequest(account.id, csv),
      userId: stranger.user.id,
    });
    expect(forged.status).toBe(400);
    const profile = await call(owner, 'POST', '/api/imports/csv/preview', {
      ...savingsRequest(account.id, csv),
      mapping: { ...mapping(), userId: stranger.user.id },
    });
    expect(profile.status).toBe(400);
  });

  test('an archived account and a Bunq-synced account cannot be imported into', async () => {
    const account = await createAccount();
    await call(owner, 'DELETE', `/api/savings/accounts/${account.id}`);
    const csv = csvOf([['2026-01-02', '1', 'A']]);
    const archived = await call(
      owner,
      'POST',
      '/api/imports/csv/preview',
      savingsRequest(account.id, csv),
    );
    expect(archived.status).toBe(404);
    const synced = await createAccount();
    await db
      .update(savingsAccounts)
      .set({ bunqAccountId: 'synthetic-1' })
      .where(eq(savingsAccounts.id, synced.id));
    const refused = await call(
      owner,
      'POST',
      '/api/imports/csv/preview',
      savingsRequest(synced.id, csv),
    );
    expect(refused.status).toBe(400);
  });
});

describe('profiles', () => {
  test('a saved mapping is remembered per source and replaced on the next save', async () => {
    const account = await createAccount();
    const csv = csvOf([['2026-01-02', '1', 'A']]);
    const staged = await stage(account.id, csv, { mapping: mapping({ source: 'Profile bank' }) });
    expect(staged.id).toBeGreaterThan(0);
    const reviewed = await preview(account.id, csv, {
      mapping: mapping({ source: 'Profile bank' }),
    });
    for (const decimalSeparator of ['.', ','] as const) {
      const request = {
        ...savingsRequest(account.id, csv, {
          mapping: mapping({ source: 'Profile bank', decimalSeparator }),
        }),
        fileSha256: reviewed.fileSha256,
        selectedRows: [1],
        saveProfile: true,
      };
      await body(await call(owner, 'POST', '/api/imports/csv', request), 201);
    }
    const profiles = await body<{ id: number; source: string; mapping: CsvImportMapping }[]>(
      await call(owner, 'GET', '/api/imports/profiles?kind=savings'),
    );
    const mine = profiles.filter((p) => p.source === 'Profile bank');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.mapping.decimalSeparator).toBe(',');
    expect(
      (await body<unknown[]>(await call(stranger, 'GET', '/api/imports/profiles'))).length,
    ).toBe(0);
    expect((await call(stranger, 'DELETE', `/api/imports/profiles/${mine[0]!.id}`)).status).toBe(
      404,
    );
    expect((await call(owner, 'DELETE', `/api/imports/profiles/${mine[0]!.id}`)).status).toBe(200);
  });
});

describe('row listing', () => {
  test('lists each staged row with its outcome and the ledger row it became', async () => {
    const account = await createAccount();
    const staged = await stage(account.id, csvOf(manyLines(3)));
    await commitAll(staged.id);
    const rows = await body<{ rowNumber: number; status: string; transactionId: number | null }[]>(
      await call(owner, 'GET', `/api/imports/csv/${staged.id}/rows`),
    );
    expect(rows.map((r) => r.status)).toEqual(['committed', 'committed', 'committed']);
    const ids = (await transactionsOf(account.id)).map((r) => r.id).sort();
    expect(rows.map((r) => r.transactionId).sort()).toEqual(ids);
  });
});
