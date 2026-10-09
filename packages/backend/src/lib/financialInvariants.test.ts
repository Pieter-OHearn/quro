import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeDerivedAllocations } from './netWorth';
import { householdShare, scopeHouseholdRows } from './partner';
import { computePensionTransactionDelta } from './pensionTransactions';
import { toSignedSavingsAmount } from './savingsBalance';

// Metamorphic and property tests for the pure calculations behind the dashboard, using seeded
// random households. See docs/financial-invariants.md for the invariants they pin down.

const CASES = 300;
const RATES = new Map([
  ['EUR', 1],
  ['GBP', 1.18],
  ['USD', 0.92],
  ['AUD', 0.58],
]);
const CURRENCIES = [...RATES.keys()];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (max: number) => Math.floor(next() * max);
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => items[int(items.length)]!,
    money: (max: number) => int(max * 100) / 100,
    shuffle: <T>(items: readonly T[]): T[] =>
      items
        .map((item) => ({ item, key: next() }))
        .sort((left, right) => left.key - right.key)
        .map(({ item }) => item),
  };
}

type Random = ReturnType<typeof seededRandom>;
type Inputs = Parameters<typeof computeDerivedAllocations>;

function household(random: Random, idOffset = 0) {
  const holdingIds = Array.from({ length: random.int(4) }, (_, index) => idOffset + index + 1);
  const mortgageIds = Array.from({ length: random.int(3) }, (_, index) => idOffset + index + 1);
  return {
    savings: Array.from({ length: random.int(5) }, () => ({
      currency: random.pick(CURRENCIES),
      balance: random.money(50_000),
    })),
    holdings: holdingIds.map((id) => ({
      id,
      currency: random.pick(CURRENCIES),
      currentPrice: random.money(500),
    })),
    holdingTransactions: holdingIds.flatMap((holdingId) =>
      Array.from({ length: random.int(4) }, () => ({
        holdingId,
        type: random.pick(['buy', 'buy', 'sell', 'dividend']),
        shares: random.int(50_000) / 1_000,
      })),
    ),
    properties: Array.from({ length: random.int(3) }, () => ({
      currency: random.pick(CURRENCIES),
      currentValue: random.money(600_000),
      mortgage: random.money(400_000),
      mortgageId: mortgageIds.length > 0 && random.next() < 0.5 ? random.pick(mortgageIds) : null,
    })),
    pensions: Array.from({ length: random.int(3) }, () => ({
      currency: random.pick(CURRENCIES),
      balance: random.money(200_000),
    })),
    mortgages: mortgageIds.map((id) => ({ id, outstandingBalance: random.money(400_000) })),
    debts: Array.from({ length: random.int(3) }, () => ({
      currency: random.pick(CURRENCIES),
      remainingBalance: random.money(20_000),
    })),
  };
}

type Household = ReturnType<typeof household>;

function allocate(input: Household, rates: Inputs[0] = RATES) {
  const summary = computeDerivedAllocations(
    rates,
    input.savings,
    input.holdings,
    input.holdingTransactions,
    input.properties,
    input.pensions,
    input.mortgages,
    input.debts,
  );
  const value = (key: string) => summary.allocations.find((row) => row.key === key)!.value;
  return {
    summary,
    savings: value('savings'),
    brokerage: value('brokerage'),
    propertyEquity: value('property_equity'),
    pension: value('pension'),
  };
}

const TOLERANCE_DIGITS = 6;

describe('dashboard allocation invariants', () => {
  test('net worth is total assets minus liabilities, and assets are the sum of allocations', () => {
    const random = seededRandom(11);
    for (let index = 0; index < CASES; index += 1) {
      const { summary } = allocate(household(random));
      const assets = summary.allocations.reduce((sum, row) => sum + row.value, 0);
      expect(summary.totalAssets).toBeCloseTo(assets, TOLERANCE_DIGITS);
      expect(summary.netWorth).toBeCloseTo(
        summary.totalAssets - summary.liabilitiesTotal,
        TOLERANCE_DIGITS,
      );
      expect(summary.portfolioTotal).toBe(summary.allocations[1]!.value);
      expect(summary.currency).toBe('EUR');
    }
  });

  test('row order never changes a total', () => {
    const random = seededRandom(12);
    for (let index = 0; index < CASES; index += 1) {
      const input = household(random);
      const shuffled: Household = {
        savings: random.shuffle(input.savings),
        holdings: random.shuffle(input.holdings),
        holdingTransactions: random.shuffle(input.holdingTransactions),
        properties: random.shuffle(input.properties),
        pensions: random.shuffle(input.pensions),
        mortgages: random.shuffle(input.mortgages),
        debts: random.shuffle(input.debts),
      };
      expect(allocate(shuffled).summary.netWorth).toBeCloseTo(
        allocate(input).summary.netWorth,
        TOLERANCE_DIGITS,
      );
    }
  });

  test('totals are additive over disjoint households', () => {
    const random = seededRandom(13);
    for (let index = 0; index < CASES; index += 1) {
      const left = household(random, 0);
      const right = household(random, 100);
      const union: Household = {
        savings: [...left.savings, ...right.savings],
        holdings: [...left.holdings, ...right.holdings],
        holdingTransactions: [...left.holdingTransactions, ...right.holdingTransactions],
        properties: [...left.properties, ...right.properties],
        pensions: [...left.pensions, ...right.pensions],
        mortgages: [...left.mortgages, ...right.mortgages],
        debts: [...left.debts, ...right.debts],
      };
      const [a, b, both] = [allocate(left), allocate(right), allocate(union)];
      for (const key of ['savings', 'brokerage', 'propertyEquity', 'pension'] as const) {
        expect(both[key]).toBeCloseTo(a[key] + b[key], TOLERANCE_DIGITS);
      }
      expect(both.summary.liabilitiesTotal).toBeCloseTo(
        a.summary.liabilitiesTotal + b.summary.liabilitiesTotal,
        TOLERANCE_DIGITS,
      );
    }
  });

  test('converting first and aggregating in EUR gives the same totals as aggregating natively', () => {
    const random = seededRandom(14);
    const inEur = <T extends { currency: string }>(rows: T[], fields: (keyof T)[]) =>
      rows.map((row) => ({
        ...row,
        currency: 'EUR',
        ...Object.fromEntries(
          fields.map((field) => [field, (row[field] as number) * RATES.get(row.currency)!]),
        ),
      }));
    for (let index = 0; index < CASES; index += 1) {
      const input = household(random);
      // Linked debt is in the property's currency, so only unlinked properties convert row-wise.
      const unlinked = input.properties.map((row) => ({ ...row, mortgageId: null }));
      const native = allocate({ ...input, properties: unlinked });
      const converted = allocate({
        ...input,
        savings: inEur(input.savings, ['balance']),
        holdings: inEur(input.holdings, ['currentPrice']),
        properties: inEur(unlinked, ['currentValue', 'mortgage']),
        pensions: inEur(input.pensions, ['balance']),
        debts: inEur(input.debts, ['remainingBalance']),
      });
      expect(converted.summary.netWorth).toBeCloseTo(native.summary.netWorth, TOLERANCE_DIGITS);
    }
  });

  test('a missing FX rate fails the calculation instead of counting the amount at 1:1', () => {
    const rates = new Map([['EUR', 1]]);
    expect(() =>
      allocate(
        { ...household(seededRandom(15)), savings: [{ currency: 'GBP', balance: 10 }] },
        rates,
      ),
    ).toThrow('Missing FX rate for GBP -> EUR');
  });

  test('linked property debt replaces the stored copy and never counts as a liability', () => {
    const random = seededRandom(16);
    for (let index = 0; index < CASES; index += 1) {
      const input = household(random);
      const withoutMortgageRows = allocate({ ...input, mortgages: [] });
      const full = allocate(input);
      // Mortgages never enter liabilities: they are deducted inside property equity.
      expect(full.summary.liabilitiesTotal).toBe(withoutMortgageRows.summary.liabilitiesTotal);
      const expectedEquity = input.properties.reduce((sum, property) => {
        const debt =
          property.mortgageId === null
            ? property.mortgage
            : (input.mortgages.find((row) => row.id === property.mortgageId)?.outstandingBalance ??
              0);
        return sum + (property.currentValue - debt) * RATES.get(property.currency)!;
      }, 0);
      expect(full.propertyEquity).toBeCloseTo(expectedEquity, TOLERANCE_DIGITS);
    }
    // Negative equity is kept, not floored.
    const underwater = allocate({
      ...household(seededRandom(17)),
      properties: [{ currency: 'EUR', currentValue: 100_000, mortgage: 130_000, mortgageId: null }],
    });
    expect(underwater.propertyEquity).toBe(-30_000);
  });

  test('net-short holdings are floored at zero shares; dividends never change shares', () => {
    const { brokerage } = allocate({
      ...household(seededRandom(18)),
      holdings: [{ id: 1, currency: 'EUR', currentPrice: 10 }],
      holdingTransactions: [
        { holdingId: 1, type: 'buy', shares: 10 },
        { holdingId: 1, type: 'sell', shares: 15 },
        { holdingId: 1, type: 'dividend', shares: 99 },
      ],
    });
    expect(brokerage).toBe(0);
  });
});

describe('household attribution', () => {
  const MONEY_COLUMNS = {
    savings: ['balance'],
    savingsTransactions: ['amount'],
    properties: ['purchasePrice', 'currentValue', 'mortgage'],
    propertyTransactions: ['amount', 'interest', 'principal'],
    mortgages: ['outstandingBalance', 'monthlyPayment', 'originalAmount', 'propertyValue'],
  } as const;
  type Kind = keyof typeof MONEY_COLUMNS;

  function jointRow(random: Random, kind: Kind): Record<string, unknown> {
    const row: Record<string, unknown> = {
      id: random.int(1_000),
      interestRate: 3.25,
      date: '2026-03-31',
      currency: 'GBP',
    };
    for (const column of MONEY_COLUMNS[kind]) {
      row[column] = random.next() < 0.1 ? null : random.money(100_000);
    }
    return row;
  }

  // Each partner sees the personal share of a joint row; together they see the whole row.
  function expectHalvesAddUp(kind: Kind, row: Record<string, unknown>) {
    const [owner] = scopeHouseholdRows(kind, [row], () => true);
    const [partner] = scopeHouseholdRows(kind, [row], () => true);
    for (const column of MONEY_COLUMNS[kind]) {
      const whole = row[column];
      if (whole === null) {
        expect([owner![column], partner![column]]).toEqual([null, null]);
      } else {
        expect((owner![column] as number) + (partner![column] as number)).toBeCloseTo(
          whole as number,
          TOLERANCE_DIGITS,
        );
      }
    }
    // Identifiers, rates, dates and currencies are never scaled.
    expect([owner!.id, owner!.interestRate, owner!.date, owner!.currency]).toEqual([
      row.id,
      3.25,
      '2026-03-31',
      'GBP',
    ]);
  }

  test('the two partners’ halves of a joint row add up to the whole row', () => {
    const random = seededRandom(21);
    for (const kind of Object.keys(MONEY_COLUMNS) as Kind[]) {
      for (let index = 0; index < 50; index += 1) {
        const row = jointRow(random, kind);
        expectHalvesAddUp(kind, row);
        expect(scopeHouseholdRows(kind, [row], () => true, 'full')).toEqual([row]);
        expect(scopeHouseholdRows(kind, [row], () => false)).toEqual([row]);
      }
    }
    expect([householdShare(true), householdShare(true, 'full'), householdShare(false)]).toEqual([
      0.5, 1, 1,
    ]);
  });
});

describe('transaction signs (golden)', () => {
  test('savings: withdrawals subtract, deposits and interest add, the stored sign is ignored', () => {
    expect(
      [
        ['deposit', 100],
        ['interest', 2.5],
        ['withdrawal', 40],
        ['withdrawal', -40],
        ['deposit', -100],
        ['unknown', 7],
      ].map(([type, amount]) => toSignedSavingsAmount(type, amount)),
    ).toEqual([100, 2.5, -40, -40, 100, 7]);
  });

  test('pension: net contribution, negative fee, statement adjustment, unknown types do nothing', () => {
    expect(
      (
        [
          ['contribution', 500, 120],
          ['fee', 15, 0],
          ['annual_statement', -250, 0],
          ['annual_statement', 900, 0],
          ['transfer', 1_000, 0],
        ] as const
      ).map(([type, amount, taxAmount]) =>
        computePensionTransactionDelta({ type, amount, taxAmount }),
      ),
    ).toEqual([380, -15, -250, 900, 0]);
  });
});

describe('missing data', () => {
  test('dashboard history never swaps a failed read for an empty list', () => {
    const source = readFileSync(join(import.meta.dir, 'netWorthHistory.ts'), 'utf8');
    expect(source).not.toContain('safeLoad');
    expect(source).not.toMatch(/catch\s*\(/);
  });
});
