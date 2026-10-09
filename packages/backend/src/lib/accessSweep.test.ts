import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Owner predicates written inline (`eq(table.userId, ...)`) instead of going through
 * `lib/access.ts`. Under the current household model they are correct for tables that cannot be
 * shared; this inventory is the list of places to touch if access ever stops being "my rows plus
 * an accepted partner's joint rows". A new inline predicate fails this test until it is added
 * here, so each one is a decision, not an accident.
 */

type Inventory = Record<string, Record<string, number>>;

const INLINE_OWNER_PREDICATES: Inventory = {
  'cli/user.ts': { sessions: 1 },
  'lib/activity.ts': {
    budgetTransactions: 1,
    debtPayments: 1,
    debts: 1,
    holdingTransactions: 1,
    holdings: 1,
    payslips: 1,
    pensionPots: 1,
    pensionTransactions: 1,
  },
  'lib/authCodes.ts': { authCodes: 1 },
  'lib/bunqOAuthAttempts.ts': { bunqOauthAttempts: 1 },
  'lib/bunqPaymentProgress.ts': { bunqPaymentProgress: 1 },
  'lib/dashboardInsights.ts': { holdingTransactions: 1, payslips: 2 },
  'lib/holdingPriceSync.ts': { holdings: 3 },
  'lib/ledgerWrite.ts': { netWorthSnapshots: 1 },
  'lib/netWorth.ts': { debts: 1, holdingTransactions: 1, holdings: 1, pensionPots: 1 },
  'lib/netWorthHistory.ts': {
    debtPayments: 2,
    debts: 1,
    holdingPriceHistory: 2,
    holdingTransactions: 3,
    holdings: 1,
    netWorthSnapshots: 1,
    pensionPots: 1,
    pensionTransactions: 2,
  },
  'lib/pensionTransactions.ts': { pensionPots: 1 },
  'lib/sessions.ts': { sessions: 4 },
  'middleware/auth.ts': { sessions: 1 },
  'routes/budget.ts': { budgetCategories: 6, budgetTransactions: 4, categoryMappings: 2 },
  'routes/bunq.ts': { bunqConnections: 4, bunqPaymentProgress: 2 },
  'routes/debts.ts': { debtPayments: 3, debts: 5 },
  'routes/employments.ts': { employments: 9 },
  'routes/goals.ts': { goals: 3, savingsAccounts: 1 },
  'routes/holdings.ts': { holdingPriceHistory: 1, holdingTransactions: 2, holdings: 5 },
  'routes/partner.ts': { mortgages: 1, properties: 1, savingsAccounts: 1 },
  'routes/pension-imports.ts': {
    pensionPots: 2,
    pensionStatementImports: 3,
    pensionTransactions: 1,
  },
  'routes/pensions.ts': { pensionPots: 3, pensionTransactions: 11 },
  'routes/plan.ts': {
    budgetCategories: 1,
    budgetTransactions: 1,
    debts: 1,
    employments: 1,
    holdingTransactions: 1,
    holdings: 1,
    payslips: 3,
    planAssumptions: 2,
  },
  'routes/salary.ts': { employments: 2, payslips: 6 },
  'services/bunqBudgetSync.ts': {
    budgetCategories: 3,
    budgetTransactions: 5,
    bunqConnections: 1,
    categoryMappings: 2,
  },
  'services/bunqSavingsSync.ts': { bunqConnections: 1, savingsAccounts: 4 },
};

/** Tables whose rows an accepted partner can reach. Their access must go through the helpers. */
const SHAREABLE_TABLES = new Set([
  'savingsAccounts',
  'savingsTransactions',
  'properties',
  'propertyTransactions',
  'mortgages',
  'mortgageTransactions',
]);

/**
 * The only inline predicates on a shareable table, each deliberately limited to the caller's
 * own rows or to both members of a link.
 */
const SHAREABLE_EXCEPTIONS: Record<string, string> = {
  'routes/partner.ts': 'ending a link clears the joint flag on both members rows',
  'routes/goals.ts': 'a goal may only follow a savings account its owner holds',
  'services/bunqSavingsSync.ts': 'a bank sync writes only the connected user own accounts',
};

const SRC = join(import.meta.dir, '..');
// Helpers that define access; they are the thing the inventory is measured against.
const HELPERS = new Set(['lib/access.ts', 'lib/partner.ts']);
const PREDICATE = /\b(?:eq|inArray|ne)\(\s*([A-Za-z]+)\.userId\b/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return ['__fixtures__', 'migrations', 'test'].includes(name) ? [] : sourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

function scan(): Inventory {
  const found: Inventory = {};
  for (const file of sourceFiles(SRC)) {
    const name = relative(SRC, file).split(sep).join('/');
    if (HELPERS.has(name)) continue;
    for (const match of readFileSync(file, 'utf8').matchAll(PREDICATE)) {
      const table = match[1]!;
      found[name] ??= {};
      found[name]![table] = (found[name]![table] ?? 0) + 1;
    }
  }
  return found;
}

describe('inline owner predicates', () => {
  test('match the inventory, so every new one is a recorded decision', () => {
    expect(scan()).toEqual(INLINE_OWNER_PREDICATES);
  });

  test('shareable tables are read through the access helpers, with three recorded exceptions', () => {
    const offenders = Object.entries(scan()).flatMap(([file, tables]) =>
      Object.keys(tables)
        .filter((table) => SHAREABLE_TABLES.has(table))
        .map((table) => `${file}: ${table}`),
    );
    const unexplained = offenders.filter(
      (entry) => !(entry.split(':')[0]! in SHAREABLE_EXCEPTIONS),
    );
    expect(unexplained).toEqual([]);
    expect(Object.keys(SHAREABLE_EXCEPTIONS).sort()).toEqual(
      [...new Set(offenders.map((entry) => entry.split(':')[0]!))].sort(),
    );
  });

  test('the inventory counts what a reviewer can find by searching', () => {
    const total = Object.values(INLINE_OWNER_PREDICATES)
      .flatMap((tables) => Object.values(tables))
      .reduce((sum, count) => sum + count, 0);
    expect(total).toBeGreaterThan(100);
  });
});
