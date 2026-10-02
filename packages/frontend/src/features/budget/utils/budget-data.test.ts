import { expect, test } from 'bun:test';
import { convertCurrencyAmount, createCurrencyRateTable } from '@/lib/currencyRates';
import type { BudgetCategory, BudgetTx } from '../types';
import {
  budgetValuesForDisplay,
  buildCreateBudgetCategoryInput,
  deriveBudgetStats,
} from './budget-data';

const category: BudgetCategory = {
  id: 1,
  name: 'Food',
  emoji: 'G',
  budgeted: 1180,
  spent: 1180,
  currency: 'EUR',
  currencyNeedsReview: false,
  expenseClass: 'essential',
  color: '#111827',
  month: 'Oct',
  year: 2026,
};
const transaction: BudgetTx = {
  id: 1,
  categoryId: 1,
  amount: 1180,
  currency: 'EUR',
  currencyNeedsReview: false,
  description: 'Food',
  date: '2026-10-01',
};
const table = createCurrencyRateTable([
  {
    id: 1,
    fromCurrency: 'GBP',
    toCurrency: 'EUR',
    rate: 1.18,
    updatedAt: new Date().toISOString(),
  },
]);

test('budget display converts canonical EUR once without mutating cached category or transaction amounts', () => {
  const gbp = budgetValuesForDisplay([category], [transaction], 'GBP', (amount, from) =>
    convertCurrencyAmount(amount, from, 'GBP', table)!,
  );
  expect(deriveBudgetStats(gbp.categories)).toMatchObject({
    totalBudgeted: 1000,
    totalSpent: 1000,
  });
  expect(gbp.budgetTransactions[0]).toMatchObject({ amount: 1000, currency: 'GBP' });
  const eur = budgetValuesForDisplay([category], [transaction], 'EUR', (amount, from) =>
    convertCurrencyAmount(amount, from, 'EUR', table)!,
  );
  expect(eur.categories[0]).toEqual(category);
  expect(category.spent).toBe(1180);
  expect(transaction.amount).toBe(1180);
});

test('manual category form submits its explicit input currency for server normalization', () => {
  const input = buildCreateBudgetCategoryInput(
    { name: 'Food', emoji: 'G', budgeted: '1000', color: '#111827' },
    new Date(2026, 9, 1),
    'GBP',
  );
  expect(input).toMatchObject({ budgeted: 1000, spent: 0, currency: 'GBP', month: 'Oct' });
});
