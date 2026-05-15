/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BudgetCategoriesSection } from './BudgetCategoriesSection';
import type { BudgetCategory } from '../types';

const noop = () => {};

const categories: BudgetCategory[] = [
  {
    id: 1,
    name: 'Groceries',
    budgeted: 500,
    spent: 425.5,
    color: '#10b981',
    emoji: 'G',
    month: 'May',
    year: 2026,
  },
  {
    id: 2,
    name: 'Dining',
    budgeted: 200,
    spent: 260,
    color: '#f97316',
    emoji: 'D',
    month: 'May',
    year: 2026,
  },
];

function renderBudgetCategories({ items = categories }: { items?: BudgetCategory[] } = {}) {
  return renderToStaticMarkup(
    <BudgetCategoriesSection
      categories={items}
      overBudget={items.filter((category) => category.spent > category.budgeted)}
      fmt={(value) => `EUR ${value.toFixed(0)}`}
      fmtDec={(value) => `EUR ${value.toFixed(2)}`}
      selectedMonth="May"
      selectedYear={2026}
      isCurrentMonth={false}
      onPrevMonth={noop}
      onNextMonth={noop}
      onAddCategory={noop}
      onEditCategory={noop}
    />,
  );
}

test('BudgetCategoriesSection renders shared table rows with mobile-critical category fields', () => {
  const markup = renderBudgetCategories();

  expect(markup).toContain('Budget Categories');
  expect(markup).not.toContain('<table');
  expect(markup).toContain('Dining');
  expect(markup).toContain('EUR 260.00 / EUR 200');
  expect(markup).toContain('-EUR 60');
  expect(markup).toContain('aria-label="Edit Dining"');
  expect(markup).toContain('width:100%');
});

test('BudgetCategoriesSection renders over-budget messaging and tokenized empty state', () => {
  expect(renderBudgetCategories()).toContain('1 categories over budget');

  const emptyMarkup = renderBudgetCategories({ items: [] });

  expect(emptyMarkup).toContain('No budget categories yet');
  expect(emptyMarkup).toContain('Click Add Category to get started.');
});

test('BudgetCategoriesSection renders add button with stable smoke-test id', () => {
  const markup = renderBudgetCategories();

  expect(markup).toContain('data-testid="budget-add-category-button"');
});
