import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys as keys } from './queryKeys';

const dashboard = [keys.dashboard.summary, keys.dashboard.transactions];
const savings = [keys.savings.accounts, keys.savings.transactions];
const holdings = [
  keys.investments.holdings,
  keys.investments.holdingTransactions,
  keys.investments.prices,
];
const properties = [keys.investments.properties, keys.investments.propertyTransactions];
const pension = [keys.pensions.pots, keys.pensions.transactions, keys.pensions.documents];
const budget = [keys.budget.categories, keys.budget.transactions];

// Declare server-side dependencies here; hooks should not maintain their own sets.
export const domainQueryDependencies = {
  goals: [keys.goals],
  budgetCategory: [...budget, keys.plan.all],
  budgetTransaction: [...budget, keys.dashboard.transactions, keys.plan.all],
  budgetClassification: [keys.budget.categories, keys.plan.all],
  categoryMapping: [keys.budget.mappings],
  savings: [...savings, ...dashboard, keys.plan.all],
  bankingEntity: [keys.savings.accounts, keys.plan.all],
  holding: [...holdings, ...dashboard, keys.dashboard.insights, keys.plan.all],
  holdingPrices: [
    keys.investments.holdings,
    keys.investments.prices,
    keys.dashboard.summary,
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
