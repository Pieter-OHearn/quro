/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { invalidateDomain, invalidatePensionImport } from './queryInvalidation';
import { queryKeys as keys } from './queryKeys';

function seed(client: QueryClient, queryKeys: readonly QueryKey[]) {
  for (const key of queryKeys) client.setQueryData(key, 'cached');
}

function isInvalidated(client: QueryClient, key: QueryKey) {
  return client.getQueryState(key)?.isInvalidated;
}

test('goal changes leave dashboard and plan data cached', async () => {
  const client = new QueryClient();
  seed(client, [keys.goals, keys.dashboard.summary, keys.dashboard.transactions, keys.plan.runway]);
  await invalidateDomain(client, 'goals');
  expect(isInvalidated(client, keys.goals)).toBe(true);
  expect(isInvalidated(client, keys.dashboard.summary)).toBe(false);
  expect(isInvalidated(client, keys.dashboard.transactions)).toBe(false);
  expect(isInvalidated(client, keys.plan.runway)).toBe(false);
  client.clear();
});

test('budget category changes refresh budget and plan without refetching the dashboard', async () => {
  const client = new QueryClient();
  const categories = keys.budget.categoryList('Oct', 2026);
  seed(client, [
    categories,
    keys.budget.allCategories,
    keys.dashboard.summary,
    keys.dashboard.transactions,
    keys.plan.runway,
  ]);
  await invalidateDomain(client, 'budgetCategory');
  expect(isInvalidated(client, categories)).toBe(true);
  expect(isInvalidated(client, keys.budget.allCategories)).toBe(true);
  expect(isInvalidated(client, keys.dashboard.transactions)).toBe(false);
  expect(isInvalidated(client, keys.dashboard.summary)).toBe(false);
  expect(isInvalidated(client, keys.plan.runway)).toBe(true);
  client.clear();
});

test('savings mutations refresh account variants, transactions and runway while preserving static banks', async () => {
  const client = new QueryClient();
  const affected = [
    keys.savings.accountList(false),
    keys.savings.accountList(true),
    keys.savings.transactionList(),
    keys.savings.transactionList(1),
    keys.plan.runway,
    keys.dashboard.summary,
  ];
  seed(client, [...affected, keys.savings.bankingEntities]);
  await invalidateDomain(client, 'savings');
  for (const key of affected) expect(isInvalidated(client, key)).toBe(true);
  expect(isInvalidated(client, keys.savings.bankingEntities)).toBe(false);
  client.clear();
});

test('mortgage mutations refresh linked properties without touching brokerage data', async () => {
  const client = new QueryClient();
  const affected = [
    keys.mortgages.all,
    keys.mortgages.archived,
    keys.mortgages.transactions(1),
    keys.investments.properties,
    keys.investments.archivedProperties,
    keys.dashboard.summary,
    keys.plan.runway,
  ];
  seed(client, [...affected, keys.investments.holdings, keys.investments.prices]);
  await invalidateDomain(client, 'mortgage');
  for (const key of affected) expect(isInvalidated(client, key)).toBe(true);
  expect(isInvalidated(client, keys.investments.holdings)).toBe(false);
  expect(isInvalidated(client, keys.investments.prices)).toBe(false);
  client.clear();
});

test('pension row edits refresh only their import, rows, feed and notifications', async () => {
  const client = new QueryClient();
  const affected = [
    keys.pensions.import(1),
    keys.pensions.importRows(1),
    keys.pensions.importFeed,
    keys.pensions.notificationList('queued,processing', 30),
  ];
  const unaffected = [
    keys.pensions.import(2),
    keys.pensions.importRows(2),
    keys.pensions.pots,
    keys.dashboard.summary,
  ];
  seed(client, [...affected, ...unaffected]);
  await invalidatePensionImport(client, 1);
  for (const key of affected) expect(isInvalidated(client, key)).toBe(true);
  for (const key of unaffected) expect(isInvalidated(client, key)).toBe(false);
  client.clear();
});

test('document changes preserve financial totals and unrelated salary history', async () => {
  const client = new QueryClient();
  seed(client, [
    keys.salary.payslips,
    keys.salary.history,
    keys.dashboard.transactions,
    keys.dashboard.summary,
  ]);
  await invalidateDomain(client, 'salaryDocument');
  expect(isInvalidated(client, keys.salary.payslips)).toBe(true);
  expect(isInvalidated(client, keys.salary.history)).toBe(false);
  expect(isInvalidated(client, keys.dashboard.transactions)).toBe(false);
  expect(isInvalidated(client, keys.dashboard.summary)).toBe(false);
  client.clear();
});

test('domain invalidation waits until active dependent queries finish refetching', async () => {
  const client = new QueryClient();
  client.setQueryData(keys.goals, 'before');
  let resolveRefetch: (data: string) => void = () => undefined;
  const refetch = new Promise<string>((resolve) => {
    resolveRefetch = resolve;
  });
  const observer = new QueryObserver(client, {
    queryKey: keys.goals,
    staleTime: Infinity,
    queryFn: () => refetch,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  let finished = false;
  const invalidation = invalidateDomain(client, 'goals').then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  resolveRefetch('after');
  await invalidation;
  expect(client.getQueryData(keys.goals)).toBe('after');
  unsubscribe();
  client.clear();
});

test('bunq sync refreshes newly created category mappings without refetching static banks', async () => {
  const client = new QueryClient();
  seed(client, [
    keys.budget.mappings,
    keys.savings.accounts,
    keys.plan.runway,
    keys.savings.bankingEntities,
  ]);
  await invalidateDomain(client, 'bunqSync');
  expect(isInvalidated(client, keys.budget.mappings)).toBe(true);
  expect(isInvalidated(client, keys.savings.accounts)).toBe(true);
  expect(isInvalidated(client, keys.plan.runway)).toBe(true);
  expect(isInvalidated(client, keys.savings.bankingEntities)).toBe(false);
  client.clear();
});

test('pension deletion refreshes import rows whose committed transaction reference was cleared', async () => {
  const client = new QueryClient();
  seed(client, [
    keys.pensions.importRows(1),
    keys.pensions.transactions,
    keys.pensions.documents,
    keys.pensions.pots,
    keys.dashboard.summary,
  ]);
  await invalidateDomain(client, 'pension');
  expect(isInvalidated(client, keys.pensions.importRows(1))).toBe(true);
  expect(isInvalidated(client, keys.pensions.transactions)).toBe(true);
  expect(isInvalidated(client, keys.pensions.documents)).toBe(true);
  expect(isInvalidated(client, keys.pensions.pots)).toBe(true);
  expect(isInvalidated(client, keys.dashboard.summary)).toBe(true);
  client.clear();
});

test('salary and holding changes refresh dashboard insight variants, while document writes preserve them', async () => {
  const client = new QueryClient();
  const variants = [keys.dashboard.insightYear(2025), keys.dashboard.insightYear(2026)];
  for (const domain of ['salary', 'holding', 'employment'] as const) {
    seed(client, variants);
    await invalidateDomain(client, domain);
    for (const key of variants) expect(isInvalidated(client, key)).toBe(true);
  }
  seed(client, variants);
  await invalidateDomain(client, 'salaryDocument');
  for (const key of variants) expect(isInvalidated(client, key)).toBe(false);
  client.clear();
});

test('session revocations refresh the session list and nothing else', async () => {
  const client = new QueryClient();
  seed(client, [keys.sessions, keys.partner, keys.dashboard.summary, keys.registrationPolicy]);
  await invalidateDomain(client, 'sessions');
  expect(isInvalidated(client, keys.sessions)).toBe(true);
  expect(isInvalidated(client, keys.partner)).toBe(false);
  expect(isInvalidated(client, keys.dashboard.summary)).toBe(false);
  expect(isInvalidated(client, keys.registrationPolicy)).toBe(false);
  client.clear();
});
