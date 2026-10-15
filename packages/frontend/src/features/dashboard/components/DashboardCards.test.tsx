/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { AllocationItem, DashboardTransaction } from '../types';
import { AssetAllocationCard } from './AssetAllocationCard';
import { RecentTransactionsCard } from './RecentTransactionsCard';

const fmtBase = (value: number) => `€${value.toFixed(2)}`;

const transactions: DashboardTransaction[] = [
  {
    id: 1,
    name: 'Salary',
    category: 'Income',
    date: '2026-10-01',
    type: 'income',
    amount: 3760,
    isJoint: false,
  },
  {
    id: 2,
    name: 'Weekly shop',
    category: 'Budget',
    date: '2026-10-09',
    type: 'expense',
    amount: -135.75,
    isJoint: false,
  },
  {
    id: 3,
    name: 'Correction',
    category: 'Budget',
    date: '2026-10-10',
    type: 'expense',
    amount: 0,
    isJoint: false,
  },
];

function renderTransactions() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RecentTransactionsCard transactions={transactions} baseCurrency="EUR" fmtBase={fmtBase} />
    </MemoryRouter>,
  );
}

test('recent transactions show money in as a gain with a plus sign', () => {
  const markup = renderTransactions();
  expect(markup).toContain('<span class="whitespace-nowrap text-gain">+€3760.00</span>');
});

test('recent transactions show money out in the figure colour with a true minus sign', () => {
  const markup = renderTransactions();
  expect(markup).toContain('<span class="whitespace-nowrap text-fg">−€135.75</span>');
  expect(markup).toContain('<span class="whitespace-nowrap text-fg">€0.00</span>');
  expect(markup).not.toContain('text-loss');
});

test('recent transactions read calendar dates as "09 Oct 2026" and link to the budget', () => {
  const markup = renderTransactions();
  expect(markup).toContain('09 Oct 2026');
  expect(markup).toContain('01 Oct 2026');
  expect(markup).toContain('href="/budget"');
  expect(markup).toContain('text-brand');
});

const allocations: AllocationItem[] = [
  { key: 'savings', name: 'Savings', value: 300, color: 'var(--viz-1)' },
  { key: 'brokerage', name: 'Brokerage', value: 100, color: 'var(--viz-2)' },
  { key: 'pension', name: 'Pension', value: 600, color: 'var(--viz-3)' },
];

test('asset allocation draws a stacked bar and rows in the asset-class colours, debt last', () => {
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <AssetAllocationCard
        allocationData={allocations}
        totalAlloc={1000}
        liabilitiesTotal={250}
        debtCount={2}
        netWorth={750}
        baseCurrency="EUR"
        fmtBase={fmtBase}
      />
    </MemoryRouter>,
  );
  expect(markup).toContain('flex h-2 gap-px overflow-hidden rounded-full');
  expect(markup).toContain('background-color:var(--viz-1);width:30%');
  expect(markup).toContain('background-color:var(--viz-3);width:60%');
  expect(markup).toContain('background-color:var(--viz-6)');
  expect(markup).toContain('2 active debts');
  expect(markup).toContain('−€250.00');
  expect(markup).toContain('border-t border-border-strong');
  expect(markup).toContain('€750.00');
  expect(markup.indexOf('Liabilities')).toBeGreaterThan(markup.indexOf('Pension'));
  expect(markup).not.toMatch(/#[0-9a-fA-F]{6}/);
});
