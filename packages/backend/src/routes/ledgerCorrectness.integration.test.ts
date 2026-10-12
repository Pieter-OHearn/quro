import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { toCents } from '@quro/shared';
import { db } from '../db/client';
import {
  budgetCategories,
  debts,
  mortgages,
  pensionPots,
  pensionStatementImportRows,
  pensionStatementImports,
  pensionTransactions,
  properties,
} from '../db/schema';
import { createIntegrationHelpers, type AuthSession } from '../test/integration';

// Ledger edge cases: a repayment that the zero clamp cuts short, a repayment whose property is
// linked to a mortgage afterwards, a cascade archive racing an edit, and two imports of one
// statement committed together.

const integration = createIntegrationHelpers('ledger-correctness.integration.quro.test');
const DATE = '2026-03-02';

beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());

async function created<T>(response: Response): Promise<T> {
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: T }).data;
}

function post(session: AuthSession, path: string, json: unknown) {
  return integration.request(path, { method: 'POST', cookie: session.cookie, json });
}

function patch(session: AuthSession, path: string, json: unknown) {
  return integration.request(path, { method: 'PATCH', cookie: session.cookie, json });
}

function remove(session: AuthSession, path: string) {
  return integration.request(path, { method: 'DELETE', cookie: session.cookie });
}

async function expectStatus(response: Response, status: number) {
  if (response.status !== status) {
    throw new Error(`Expected ${status}, got ${response.status}: ${await response.text()}`);
  }
}

async function debtBalance(id: number) {
  const [row] = await db.select().from(debts).where(eq(debts.id, id));
  return toCents(row!.remainingBalance);
}

async function mortgageBalance(id: number) {
  const [row] = await db.select().from(mortgages).where(eq(mortgages.id, id));
  return toCents(row!.outstandingBalance);
}

async function manualPropertyDebt(id: number) {
  const [row] = await db.select().from(properties).where(eq(properties.id, id));
  return toCents(row!.mortgage);
}

async function createProperty(owner: AuthSession, address: string, mortgage = 0) {
  return created<{ id: number }>(
    await post(owner, '/api/investments/properties', {
      address,
      propertyType: 'primary_home',
      purchasePrice: 300000,
      currentValue: 320000,
      mortgage,
      monthlyRent: 0,
      currency: 'EUR',
      emoji: 'H',
    }),
  );
}

async function createMortgage(owner: AuthSession, propertyId: number, outstandingBalance: number) {
  return created<{ id: number }>(
    await post(owner, '/api/mortgages', {
      linkedPropertyId: propertyId,
      lender: 'Synthetic Lender',
      originalAmount: Math.max(outstandingBalance, 1000),
      outstandingBalance,
      propertyValue: 320000,
      monthlyPayment: 100,
      interestRate: 3,
      rateType: 'Variable',
      termYears: 30,
      startDate: '2026-01-01',
      endDate: '2056-01-01',
    }),
  );
}

describe('a repayment that the zero clamp cuts short', () => {
  test('debt: deleting the payment restores exactly the balance it reduced', async () => {
    const owner = await integration.signUp('clamp-debt');
    const debt = await created<{ id: number }>(
      await post(owner, '/api/debts', {
        name: 'Clamp loan',
        type: 'personal_loan',
        lender: 'Synthetic Lender',
        originalAmount: 100,
        remainingBalance: 100,
        currency: 'EUR',
        interestRate: 5,
        monthlyPayment: 10,
        startDate: '2026-01-01',
        color: '#ef4444',
        emoji: 'D',
      }),
    );
    const payment = await created<{ id: number }>(
      await post(owner, '/api/debts/payments', {
        debtId: debt.id,
        amount: 100.01,
        interest: 0,
        date: DATE,
      }),
    );
    expect(await debtBalance(debt.id)).toBe(0);

    await expectStatus(await remove(owner, `/api/debts/payments/${payment.id}`), 200);
    expect(await debtBalance(debt.id)).toBe(toCents(100));
  });

  test('mortgage: editing or deleting the repayment reverses only what it applied', async () => {
    const owner = await integration.signUp('clamp-mortgage');
    const property = await createProperty(owner, '1 Clamp Street');
    const mortgage = await createMortgage(owner, property.id, 100);
    const repayment = await created<{ id: number }>(
      await post(owner, '/api/mortgages/transactions', {
        mortgageId: mortgage.id,
        type: 'repayment',
        amount: 100.01,
        interest: 0,
        date: DATE,
      }),
    );
    expect(await mortgageBalance(mortgage.id)).toBe(0);

    // Editing reverses what was applied (100.00) before applying the new principal.
    await expectStatus(
      await patch(owner, `/api/mortgages/transactions/${repayment.id}`, {
        amount: 40,
        principal: 40,
      }),
      200,
    );
    expect(await mortgageBalance(mortgage.id)).toBe(toCents(60));

    // Clamped again, then deleted: the opening balance comes back to the cent.
    await expectStatus(
      await patch(owner, `/api/mortgages/transactions/${repayment.id}`, {
        amount: 100.01,
        principal: 100.01,
      }),
      200,
    );
    expect(await mortgageBalance(mortgage.id)).toBe(0);
    await expectStatus(await remove(owner, `/api/mortgages/transactions/${repayment.id}`), 200);
    expect(await mortgageBalance(mortgage.id)).toBe(toCents(100));
  });

  test('property: deleting the repayment restores exactly the manual debt it reduced', async () => {
    const owner = await integration.signUp('clamp-property');
    const property = await createProperty(owner, '2 Clamp Street', 100);
    const repayment = await created<{ id: number }>(
      await post(owner, '/api/investments/property-transactions', {
        propertyId: property.id,
        type: 'repayment',
        amount: 100.01,
        interest: 0,
        principal: 100.01,
        date: DATE,
      }),
    );
    expect(await manualPropertyDebt(property.id)).toBe(0);

    await expectStatus(
      await remove(owner, `/api/investments/property-transactions/${repayment.id}`),
      200,
    );
    expect(await manualPropertyDebt(property.id)).toBe(toCents(100));
  });
});

// Budget spending is the other balance clamped at zero. Its transactions are positive and only
// ever add to the category they are on, so ledger writes alone never reach the clamp.
test('budget: creating, editing, moving and deleting transactions returns spending exactly', async () => {
  const owner = await integration.signUp('clamp-budget');
  const category = async (name: string, spent: number) =>
    created<{ id: number }>(
      await post(owner, '/api/budget/categories', {
        name,
        emoji: 'B',
        budgeted: 100,
        spent,
        color: '#f59e0b',
        month: 'Mar',
        year: 2026,
      }),
    );
  const groceries = await category('Clamp groceries', 0.01);
  const dining = await category('Clamp dining', 0);
  const spent = async (id: number) => {
    const [row] = await db.select().from(budgetCategories).where(eq(budgetCategories.id, id));
    return toCents(row!.spent);
  };

  const shop = await created<{ id: number }>(
    await post(owner, '/api/budget/transactions', {
      categoryId: groceries.id,
      description: 'Shop',
      amount: 100.01,
      date: DATE,
      merchant: 'Synthetic Market',
    }),
  );
  await expectStatus(
    await patch(owner, `/api/budget/transactions/${shop.id}`, { amount: 0.02 }),
    200,
  );
  await expectStatus(
    await patch(owner, `/api/budget/transactions/${shop.id}`, { categoryId: dining.id }),
    200,
  );
  expect(await spent(groceries.id)).toBe(1);
  expect(await spent(dining.id)).toBe(2);
  await expectStatus(await remove(owner, `/api/budget/transactions/${shop.id}`), 200);
  expect(await spent(groceries.id)).toBe(1);
  expect(await spent(dining.id)).toBe(0);
});

describe('a property repayment stays with the debt it paid', () => {
  const repayment = (propertyId: number, principal: number) => ({
    propertyId,
    type: 'repayment',
    amount: principal,
    interest: 0,
    principal,
    date: DATE,
  });

  test('linked to a mortgage afterwards: edits and deletes leave the mortgage alone', async () => {
    const owner = await integration.signUp('link-after-repayment');
    const property = await createProperty(owner, '3 Link Street', 1000);
    const deleted = await created<{ id: number }>(
      await post(owner, '/api/investments/property-transactions', repayment(property.id, 100)),
    );
    const edited = await created<{ id: number }>(
      await post(owner, '/api/investments/property-transactions', repayment(property.id, 200)),
    );
    expect(await manualPropertyDebt(property.id)).toBe(toCents(700));

    const mortgage = await createMortgage(owner, property.id, 50000);
    expect(await mortgageBalance(mortgage.id)).toBe(toCents(50000));

    await expectStatus(
      await patch(owner, `/api/investments/property-transactions/${edited.id}`, {
        note: 'Corrected note',
      }),
      200,
    );
    await expectStatus(
      await patch(owner, `/api/investments/property-transactions/${edited.id}`, {
        amount: 150,
        principal: 150,
      }),
      200,
    );
    await expectStatus(
      await remove(owner, `/api/investments/property-transactions/${deleted.id}`),
      200,
    );
    // The mortgage never received these repayments, so it is not charged for them either.
    expect(await mortgageBalance(mortgage.id)).toBe(toCents(50000));
  });

  test('remortgaged: deleting a repayment restores the mortgage it reduced', async () => {
    const owner = await integration.signUp('remortgage');
    const property = await createProperty(owner, '4 Link Street');
    const first = await createMortgage(owner, property.id, 40000);
    const paid = await created<{ id: number }>(
      await post(owner, '/api/investments/property-transactions', repayment(property.id, 500)),
    );
    expect(await mortgageBalance(first.id)).toBe(toCents(39500));

    await expectStatus(await remove(owner, `/api/mortgages/${first.id}`), 200);
    const second = await createMortgage(owner, property.id, 60000);

    await expectStatus(
      await remove(owner, `/api/investments/property-transactions/${paid.id}`),
      200,
    );
    expect(await mortgageBalance(second.id)).toBe(toCents(60000));
    expect(await mortgageBalance(first.id)).toBe(toCents(40000));
  });
});

// Waits until `count` other backends of this database wait for a lock.
async function waitForLockWaiters(count: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [row] = await db.execute<{ waiting: number }>(
      sql`SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((row?.waiting ?? 0) >= count) return;
    await Bun.sleep(25);
  }
  throw new Error(`Expected ${count} requests to wait for a lock`);
}

test('a cascade archive of a mortgage and an edit of its repayment do not deadlock', async () => {
  const owner = await integration.signUp('archive-vs-edit');
  const property = await createProperty(owner, '5 Race Street');
  const mortgage = await createMortgage(owner, property.id, 80000);
  const repayment = await created<{ id: number }>(
    await post(owner, '/api/mortgages/transactions', {
      mortgageId: mortgage.id,
      type: 'repayment',
      amount: 1000,
      interest: 400,
      principal: 600,
      date: DATE,
    }),
  );

  // Hold the linked property so the archive stops after locking the mortgage, then send the
  // edit while the archive waits: the two requests overlap in the order that used to deadlock.
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let holding!: () => void;
  const held = new Promise<void>((resolve) => {
    holding = resolve;
  });
  const blocker = db.transaction(async (tx) => {
    await tx.select().from(properties).where(eq(properties.id, property.id)).for('update');
    holding();
    await released;
  });
  await held;

  const archive = remove(owner, `/api/mortgages/${mortgage.id}?cascade=true`);
  await waitForLockWaiters(1);
  const edit = patch(owner, `/api/mortgages/transactions/${repayment.id}`, {
    amount: 1100,
    principal: 700,
  });
  await waitForLockWaiters(2);
  release();
  await blocker;

  const [archived, edited] = await Promise.all([archive, edit]);
  expect(archived.status).toBe(200);
  // The archive removed the repayment first, so the edit finds nothing to change.
  expect(edited.status).toBe(404);
  expect(await db.select().from(mortgages).where(eq(mortgages.id, mortgage.id))).toHaveLength(0);
});

describe('two imports of one pension statement', () => {
  async function seedImport(owner: AuthSession, potId: number, hash: string, periodEnd: string) {
    const [record] = await db
      .insert(pensionStatementImports)
      .values({
        userId: owner.user.id,
        potId,
        status: 'ready_for_review',
        storageKey: `synthetic/${crypto.randomUUID()}.pdf`,
        fileName: 'synthetic-statement.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        fileHashSha256: hash,
        statementPeriodStart: '2025-01-01',
        // The parser read the period differently on each upload of the same file.
        statementPeriodEnd: periodEnd,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    await db.insert(pensionStatementImportRows).values([
      {
        importId: record!.id,
        rowOrder: 0,
        type: 'contribution',
        amount: 1200,
        taxAmount: 0,
        date: '2025-06-30',
        isEmployer: true,
      },
      { importId: record!.id, rowOrder: 1, type: 'annual_statement', amount: 300, date: periodEnd },
    ]);
    return record!.id;
  }

  test('committed at once, only one writes rows and the other is answered 409', async () => {
    const owner = await integration.signUp('duplicate-import');
    const pot = await created<{ id: number }>(
      await post(owner, '/api/pensions/pots', {
        name: 'Imported pension',
        provider: 'Synthetic Provider',
        type: 'Workplace Pension',
        balance: 1000,
        currency: 'EUR',
        employeeMonthly: 0,
        employerMonthly: 0,
        investmentStrategy: 'Balanced',
        color: '#1d4ed8',
        emoji: 'I',
      }),
    );
    // Two uploads of the same file that raced past the upload check.
    const hash = crypto.randomUUID().replaceAll('-', '');
    const first = await seedImport(owner, pot.id, hash, '2025-12-31');
    const second = await seedImport(owner, pot.id, hash, '2025-12-30');

    const responses = await Promise.all([
      post(owner, `/api/pensions/imports/${first}/commit`, {}),
      post(owner, `/api/pensions/imports/${second}/commit`, {}),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const ledger = await db
      .select()
      .from(pensionTransactions)
      .where(eq(pensionTransactions.potId, pot.id));
    expect(ledger).toHaveLength(2);
    const [row] = await db.select().from(pensionPots).where(eq(pensionPots.id, pot.id));
    expect(toCents(row!.balance)).toBe(toCents(1000 + 1200 + 300));
    const statuses = await db
      .select({ status: pensionStatementImports.status })
      .from(pensionStatementImports)
      .where(eq(pensionStatementImports.potId, pot.id));
    expect(statuses.map((entry) => entry.status).sort()).toEqual(['committed', 'ready_for_review']);
  });
});
