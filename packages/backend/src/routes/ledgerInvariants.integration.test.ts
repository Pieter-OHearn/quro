import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { inArray } from 'drizzle-orm';
import { toCents } from '@quro/shared';
import { db } from '../db/client';
import {
  debts,
  pensionPots,
  pensionTransactions,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { computePensionTransactionDelta } from '../lib/pensionTransactions';
import { toSignedSavingsAmount } from '../lib/savingsBalance';
import { createIntegrationHelpers, insertPartnerLink, type AuthSession } from '../test/integration';

// Property tests over seeded random sequences of ledger writes. Whatever the order of creates,
// edits, moves between parents and deletes, and whichever partner makes them, every parent
// balance equals its opening balance plus the effect of the rows still in its ledger, and moves
// between parents conserve the total. A failure prints the seed and the step.

const integration = createIntegrationHelpers('ledger-invariants.integration.quro.test');
const SEED = 20261009;
const STEPS = 40;
const SEQUENCE_TIMEOUT_MS = 60_000;

beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());

// mulberry32: small, fast and deterministic, so a failing sequence can be replayed.
function seededRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    // A positive amount with whole cents, the precision the forms send.
    cents: (max: number) => (1 + Math.floor(next() * (max * 100 - 1))) / 100,
    // Fisher-Yates over a copy, driven by the same seed.
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(next() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
      }
      return copy;
    },
  };
}

async function read<T>(response: Response, status = 200): Promise<T> {
  if (response.status !== status) {
    throw new Error(`Expected ${status}, got ${response.status}: ${await response.text()}`);
  }
  return ((await response.json()) as { data: T }).data;
}

function send(session: AuthSession, method: string, path: string, json?: unknown) {
  return integration.request(path, { method, cookie: session.cookie, json });
}

const sumCents = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + toCents(value), 0);

describe('ledger balances equal their opening balance plus their remaining ledger', () => {
  test(
    'savings: random deposits, withdrawals, edits, moves and deletes by both partners',
    async () => {
      const owner = await integration.signUp('savings-owner');
      const partner = await integration.signUp('savings-partner');
      await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
      const random = seededRandom(SEED);

      const openings = new Map<number, number>();
      const account = async (session: AuthSession, balance: number, isJoint: boolean) => {
        const row = await read<{ id: number }>(
          await send(session, 'POST', '/api/savings/accounts', {
            name: `Account ${openings.size + 1}`,
            bank: 'Synthetic Bank',
            balance,
            currency: 'EUR',
            interestRate: 1,
            accountType: 'Easy Access',
            color: '#0ea5e9',
            emoji: 'S',
            isJoint,
          }),
          201,
        );
        openings.set(row.id, balance);
        return row.id;
      };
      const ownerPrivate = await account(owner, 5_000, false);
      const ownerJoint = await account(owner, 2_500.5, true);
      const partnerJoint = await account(partner, 1_200.25, true);
      // Each actor writes only to accounts it can see.
      const reachable = new Map<AuthSession, number[]>([
        [owner, [ownerPrivate, ownerJoint, partnerJoint]],
        [partner, [ownerJoint, partnerJoint]],
      ]);
      const live = new Map<number, number>(); // transaction id -> account id

      for (let step = 0; step < STEPS; step += 1) {
        const actor = random.pick([owner, partner]);
        const accounts = reachable.get(actor)!;
        const editable = [...live].filter(([, accountId]) => accounts.includes(accountId));
        const action =
          editable.length === 0 ? 'create' : random.pick(['create', 'edit', 'move', 'delete']);
        const context = `seed ${SEED}, step ${step}, ${action}`;
        if (action === 'create') {
          const accountId = random.pick(accounts);
          const created = await read<{ id: number }>(
            await send(actor, 'POST', '/api/savings/transactions', {
              accountId,
              type: random.pick(['deposit', 'withdrawal', 'interest']),
              amount: random.cents(500),
              date: '2026-03-02',
            }),
            201,
          );
          live.set(created.id, accountId);
        } else {
          const [transactionId] = random.pick(editable);
          if (action === 'delete') {
            await read(await send(actor, 'DELETE', `/api/savings/transactions/${transactionId}`));
            live.delete(transactionId);
          } else if (action === 'move') {
            const accountId = random.pick(accounts);
            await read(
              await send(actor, 'PATCH', `/api/savings/transactions/${transactionId}`, {
                accountId,
              }),
            );
            live.set(transactionId, accountId);
          } else {
            await read(
              await send(actor, 'PATCH', `/api/savings/transactions/${transactionId}`, {
                type: random.pick(['deposit', 'withdrawal']),
                amount: random.cents(500),
              }),
            );
          }
        }

        const ids = [...openings.keys()];
        const balances = await db
          .select()
          .from(savingsAccounts)
          .where(inArray(savingsAccounts.id, ids));
        const ledger = await db
          .select()
          .from(savingsTransactions)
          .where(inArray(savingsTransactions.accountId, ids));
        for (const row of balances) {
          const effect = sumCents(
            ledger
              .filter((txn) => txn.accountId === row.id)
              .map((txn) => toSignedSavingsAmount(txn.type, txn.amount)),
          );
          expect({ context, account: row.id, cents: toCents(row.balance) }).toEqual({
            context,
            account: row.id,
            cents: toCents(openings.get(row.id)!) + effect,
          });
        }
        expect(ledger.map((txn) => txn.id).sort()).toEqual([...live.keys()].sort());
      }
    },
    SEQUENCE_TIMEOUT_MS,
  );

  test(
    'pension: random contributions, fees, statements, edits, moves and deletes',
    async () => {
      const owner = await integration.signUp('pension-owner');
      const random = seededRandom(SEED + 1);
      const openings = new Map<number, number>();
      for (const balance of [10_000, 2_345.67]) {
        const pot = await read<{ id: number }>(
          await send(owner, 'POST', '/api/pensions/pots', {
            name: `Pot ${openings.size + 1}`,
            provider: 'Synthetic Provider',
            type: 'Workplace Pension',
            balance,
            currency: 'EUR',
            employeeMonthly: 0,
            employerMonthly: 0,
            investmentStrategy: 'Balanced',
            color: '#1d4ed8',
            emoji: 'P',
          }),
          201,
        );
        openings.set(pot.id, balance);
      }
      const pots = [...openings.keys()];
      const payload = () => {
        const type = random.pick(['contribution', 'fee', 'annual_statement'] as const);
        const amount = random.cents(800);
        return type === 'contribution'
          ? { type, amount, taxAmount: Math.min(amount, random.cents(100)), isEmployer: true }
          : { type, amount, taxAmount: 0 };
      };
      const live = new Set<number>();

      const write = async (action: string) => {
        if (action === 'create') {
          const created = await read<{ id: number }>(
            await send(owner, 'POST', '/api/pensions/transactions', {
              potId: random.pick(pots),
              date: '2026-03-02',
              ...payload(),
            }),
            201,
          );
          live.add(created.id);
          return;
        }
        const id = random.pick([...live]);
        const path = `/api/pensions/transactions/${id}`;
        if (action === 'delete') {
          await read(await send(owner, 'DELETE', path));
          live.delete(id);
          return;
        }
        await read(
          await send(
            owner,
            'PATCH',
            path,
            action === 'move' ? { potId: random.pick(pots) } : payload(),
          ),
        );
      };

      for (let step = 0; step < STEPS; step += 1) {
        await write(live.size === 0 ? 'create' : random.pick(['create', 'edit', 'move', 'delete']));
        const rows = await db.select().from(pensionPots).where(inArray(pensionPots.id, pots));
        const ledger = await db
          .select()
          .from(pensionTransactions)
          .where(inArray(pensionTransactions.potId, pots));
        for (const row of rows) {
          const effect = sumCents(
            ledger.filter((txn) => txn.potId === row.id).map(computePensionTransactionDelta),
          );
          expect({ step, pot: row.id, cents: toCents(row.balance) }).toEqual({
            step,
            pot: row.id,
            cents: toCents(openings.get(row.id)!) + effect,
          });
        }
      }
    },
    SEQUENCE_TIMEOUT_MS,
  );
});

describe('metamorphic: an edit and its inverse, or a write and its deletion, change nothing', () => {
  test('debt payments: paying and deleting in any order returns the opening balance', async () => {
    const owner = await integration.signUp('debt-owner');
    const random = seededRandom(SEED + 2);
    const debt = await read<{ id: number }>(
      await send(owner, 'POST', '/api/debts', {
        name: 'Loan',
        type: 'personal_loan',
        lender: 'Synthetic Lender',
        originalAmount: 12_000,
        remainingBalance: 9_876.54,
        currency: 'EUR',
        interestRate: 4,
        monthlyPayment: 250,
        startDate: '2026-01-01',
        color: '#ef4444',
        emoji: 'D',
      }),
      201,
    );
    const payments: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      const amount = random.cents(400);
      const created = await read<{ id: number }>(
        await send(owner, 'POST', '/api/debts/payments', {
          debtId: debt.id,
          amount,
          interest: Math.min(amount, random.cents(50)),
          date: '2026-03-02',
        }),
        201,
      );
      payments.push(created.id);
    }
    // Delete in a shuffled order: the restorations commute.
    for (const id of random.shuffle(payments)) {
      await read(await send(owner, 'DELETE', `/api/debts/payments/${id}`));
    }
    const [row] = await db
      .select()
      .from(debts)
      .where(inArray(debts.id, [debt.id]));
    expect(toCents(row!.remainingBalance)).toBe(toCents(9_876.54));
  });

  test('mortgage repayments: editing a repayment and editing it back restores the balance', async () => {
    const owner = await integration.signUp('mortgage-owner');
    const home = await read<{ id: number }>(
      await send(owner, 'POST', '/api/investments/properties', {
        address: '3 Inverse Road',
        propertyType: 'primary_home',
        purchasePrice: 200_000,
        currentValue: 210_000,
        monthlyRent: 0,
        currency: 'EUR',
        emoji: 'H',
      }),
      201,
    );
    const mortgage = await read<{ id: number }>(
      await send(owner, 'POST', '/api/mortgages', {
        linkedPropertyId: home.id,
        lender: 'Synthetic Lender',
        originalAmount: 150_000,
        outstandingBalance: 123_456.78,
        propertyValue: 210_000,
        monthlyPayment: 800,
        interestRate: 2.5,
        rateType: 'fixed',
        fixedUntil: '2030-01-01',
        termYears: 25,
        startDate: '2026-01-01',
        endDate: '2051-01-01',
      }),
      201,
    );
    const balance = async () => {
      const read = await send(owner, 'GET', `/api/investments/properties/${home.id}`);
      return toCents(((await read.json()) as { data: { mortgage: number } }).data.mortgage);
    };
    const repayment = await read<{ id: number }>(
      await send(owner, 'POST', '/api/mortgages/transactions', {
        mortgageId: mortgage.id,
        type: 'repayment',
        amount: 800,
        interest: 256.33,
        principal: 543.67,
        date: '2026-03-02',
      }),
      201,
    );
    const afterRepayment = await balance();
    expect(afterRepayment).toBe(toCents(123_456.78) - toCents(543.67));

    const path = `/api/mortgages/transactions/${repayment.id}`;
    await read(await send(owner, 'PATCH', path, { amount: 900, principal: 643.67 }));
    expect(await balance()).toBe(afterRepayment - toCents(100));
    await read(await send(owner, 'PATCH', path, { amount: 800, principal: 543.67 }));
    expect(await balance()).toBe(afterRepayment);
    await read(await send(owner, 'DELETE', path));
    expect(await balance()).toBe(toCents(123_456.78));
  });
});
