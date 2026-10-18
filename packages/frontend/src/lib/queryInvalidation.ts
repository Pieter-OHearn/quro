import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys as keys } from './queryKeys';

const dashboard = [
  keys.dashboard.summary,
  keys.dashboard.netWorth,
  keys.dashboard.transactions,
  keys.dashboard.setup,
];
const savings = [keys.savings.accounts, keys.savings.transactions];
const holdings = [
  keys.investments.holdings,
  keys.investments.holdingTransactions,
  keys.investments.prices,
  keys.exposure.all,
];
const properties = [keys.investments.properties, keys.investments.propertyTransactions];
const pension = [keys.pensions.pots, keys.pensions.transactions, keys.pensions.documents];
const budget = [keys.budget.categories, keys.budget.transactions];

// Declare server-side dependencies here; hooks should not maintain their own sets.
const domainQueryDependencies = {
  goals: [keys.goals],
  budgetCategory: [...budget, keys.plan.all],
  budgetTransaction: [...budget, keys.dashboard.transactions, keys.dashboard.setup, keys.plan.all],
  budgetClassification: [keys.budget.categories, keys.plan.all],
  categoryMapping: [keys.budget.mappings],
  savings: [...savings, ...dashboard, keys.plan.all],
  bankingEntity: [keys.savings.accounts, keys.plan.all],
  holding: [...holdings, ...dashboard, keys.dashboard.insights, keys.plan.all],
  holdingPrices: [
    keys.investments.holdings,
    keys.investments.prices,
    keys.exposure.all,
    keys.dashboard.summary,
    keys.dashboard.netWorth,
    keys.plan.all,
  ],
  property: [...properties, keys.mortgages.all, ...dashboard, keys.plan.all],
  mortgage: [keys.mortgages.all, keys.investments.properties, ...dashboard, keys.plan.all],
  debt: [keys.debts.all, ...dashboard, keys.plan.all],
  pension: [...pension, keys.pensions.imports, ...dashboard, keys.plan.all],
  pensionTransaction: [...pension, ...dashboard, keys.plan.all],
  pensionDocument: [keys.pensions.documents, keys.pensions.transactions],
  // Payslip writes also discard persisted net-worth snapshots on the server.
  salary: [keys.salary.all, ...dashboard, keys.dashboard.insights, keys.plan.all],
  salaryDocument: [keys.salary.payslips],
  employment: [keys.employments, keys.salary.all, keys.dashboard.insights, keys.plan.all],
  plan: [keys.plan.all],
  // The exposure settings, and the class a holding is filed under, change only the exposure report
  // (and the holdings list that carries the class).
  exposureSettings: [keys.exposure.all],
  holdingClassification: [keys.exposure.all, keys.investments.holdings],
  preferences: [keys.plan.all, ...dashboard],
  partner: [keys.partner],
  household: [
    keys.partner,
    ...savings,
    ...holdings,
    ...properties,
    keys.mortgages.all,
    ...dashboard,
    keys.plan.all,
  ],
  bunqConnection: [keys.bunqConnection],
  sessions: [keys.sessions],
  // A file import writes savings and budget ledgers, so everything those feed is refetched.
  csvImport: [...savings, ...budget, ...dashboard, keys.imports.all, keys.plan.all],
  bunqSync: [
    keys.bunqConnection,
    ...savings,
    ...budget,
    keys.budget.mappings,
    ...dashboard,
    keys.plan.all,
  ],
} satisfies Record<string, readonly QueryKey[]>;

export type MutationDomain = keyof typeof domainQueryDependencies;

export async function invalidateDomain(client: QueryClient, domain: MutationDomain): Promise<void> {
  await Promise.all(
    domainQueryDependencies[domain].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}

// For changes after which the old rows must not be shown while the new ones load, such as the end
// of a partner link: the cached data is dropped, not just marked stale. Active queries refetch.
export async function resetDomain(client: QueryClient, domain: MutationDomain): Promise<void> {
  await Promise.all(
    domainQueryDependencies[domain].map((queryKey) => client.resetQueries({ queryKey })),
  );
}

export async function invalidatePensionImport(
  client: QueryClient,
  importId: number,
): Promise<void> {
  // The import prefix includes its rows. Feed and notification queries use other prefixes.
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.pensions.import(importId) }),
    client.invalidateQueries({ queryKey: keys.pensions.importFeed }),
    client.invalidateQueries({ queryKey: keys.pensions.notifications }),
  ]);
}
