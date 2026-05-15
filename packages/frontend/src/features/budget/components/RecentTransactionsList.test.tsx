/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecentTransactionsList } from './RecentTransactionsList';
import type { BudgetCategory, RecentBudgetTx } from '../types';

const categories: BudgetCategory[] = [
  {
    id: 1,
    name: 'Groceries',
    budgeted: 650,
    spent: 42.35,
    color: '#16a34a',
    emoji: '🛒',
    month: 'May',
    year: 2026,
  },
  {
    id: 2,
    name: 'Dining',
    budgeted: 300,
    spent: 8.9,
    color: '#f97316',
    emoji: '🍽️',
    month: 'May',
    year: 2026,
  },
];

const transactions: RecentBudgetTx[] = [
  {
    id: 101,
    name: 'Albert Heijn',
    category: 'Groceries',
    categoryId: 1,
    amount: 42.35,
    date: '2026-05-14',
    emoji: '🛒',
    color: '#16a34a',
    bunqTransactionId: 'bunq-101',
    sourceProvider: 'bunq',
    sourceAccountId: 'account-1',
    sourceAccountName: 'Joint checking',
    sourceAccountType: 'JOINT',
  },
  {
    id: 102,
    name: 'Coffee Bar',
    category: 'Dining',
    categoryId: 2,
    amount: 8.9,
    date: '2026-05-13',
    emoji: '🍽️',
    color: '#f97316',
  },
];

const fmtDec = (value: number) => `€${value.toFixed(2)}`;
const noop = () => {};

test('RecentTransactionsList renders shared table rows with mobile-critical transaction fields', () => {
  const markup = renderToStaticMarkup(
    <RecentTransactionsList
      transactions={transactions}
      categories={categories}
      fmtDec={fmtDec}
      selectedMonth="May"
      selectedYear={2026}
      onDelete={noop}
      onChangeCategory={noop}
    />,
  );

  expect(markup).toContain('Monthly Transactions');
  expect(markup).toContain('May 2026');
  expect(markup).toContain('<table');
  expect(markup).toContain('data-mobile-label="Transaction"');
  expect(markup).toContain('data-mobile-label="Amount"');
  expect(markup).toContain('data-mobile-label="Date"');
  expect(markup).toContain('data-mobile-label="Category"');
  expect(markup).toContain('Albert Heijn');
  expect(markup).toContain('-€42.35');
  expect(markup).toContain('2026-05-14');
  expect(markup).toContain('Groceries');
  expect(markup).toContain('Bunq');
  expect(markup).toContain('Joint');
  expect(markup).toContain('aria-label="Edit transaction"');
});

test('RecentTransactionsList renders a clear empty state', () => {
  const markup = renderToStaticMarkup(
    <RecentTransactionsList
      transactions={[]}
      categories={categories}
      fmtDec={fmtDec}
      selectedMonth="May"
      selectedYear={2026}
      onDelete={noop}
      onChangeCategory={noop}
    />,
  );

  expect(markup).toContain('No transactions for this month.');
  expect(markup).toContain('colSpan="5"');
});
