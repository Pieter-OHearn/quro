import { Edit3, Plus, WalletCards } from 'lucide-react';
import { Button, Card, EmptyState, IconButton, PanelHeader } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { BudgetCategory, BudgetFormatFn } from '../types';
import { MonthYearSelector } from './MonthYearSelector';

type BudgetCategoriesSectionProps = {
  categories: BudgetCategory[];
  overBudget: BudgetCategory[];
  fmt: BudgetFormatFn;
  fmtDec: BudgetFormatFn;
  selectedMonth: string;
  selectedYear: number;
  isCurrentMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onAddCategory: () => void;
  onEditCategory: (category: BudgetCategory) => void;
};

function CategoryProgress({
  category,
  over,
  pct,
}: Readonly<{ category: BudgetCategory; over: boolean; pct: number }>) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${over ? 100 : pct}%`,
          backgroundColor: over ? 'var(--danger)' : category.color,
        }}
      />
    </div>
  );
}

function CategoryAmounts({
  over,
  spent,
  surplus,
  budgeted,
  fmt,
  fmtDec,
}: Readonly<{
  over: boolean;
  spent: number;
  surplus: number;
  budgeted: number;
  fmt: BudgetFormatFn;
  fmtDec: BudgetFormatFn;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-numeric md:justify-end">
      <span className={cn('font-semibold', over ? 'text-danger' : 'text-fg-muted')}>
        {fmtDec(spent)} / {fmt(budgeted)}
      </span>
      <span className={over ? 'font-semibold text-danger' : 'text-success'}>
        {over ? `-${fmt(Math.abs(surplus))}` : `+${fmt(surplus)} left`}
      </span>
    </div>
  );
}

function CategoryRow({
  category,
  fmt,
  fmtDec,
  onEdit,
}: Readonly<{
  category: BudgetCategory;
  fmt: BudgetFormatFn;
  fmtDec: BudgetFormatFn;
  onEdit: (category: BudgetCategory) => void;
}>) {
  const pct = category.budgeted > 0 ? Math.min((category.spent / category.budgeted) * 100, 100) : 0;
  const over = category.spent > category.budgeted;
  const surplus = category.budgeted - category.spent;

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        over
          ? 'border-danger-border bg-danger-soft'
          : 'border-transparent hover:border-border-subtle hover:bg-surface-muted',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="w-8 flex-shrink-0 text-center text-xl leading-8">{category.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <p className="truncate text-sm font-medium text-fg-strong">{category.name}</p>
            <CategoryAmounts
              over={over}
              spent={category.spent}
              surplus={surplus}
              budgeted={category.budgeted}
              fmt={fmt}
              fmtDec={fmtDec}
            />
          </div>
          <div className="mt-2">
            <CategoryProgress category={category} over={over} pct={pct} />
          </div>
        </div>
        <IconButton
          onClick={() => onEdit(category)}
          icon={Edit3}
          label={`Edit ${category.name}`}
          variant="subtle"
          size="sm"
        />
      </div>
    </div>
  );
}

function CategoryList({
  categories,
  fmt,
  fmtDec,
  onAddCategory,
  onEditCategory,
}: Readonly<{
  categories: BudgetCategory[];
  fmt: BudgetFormatFn;
  fmtDec: BudgetFormatFn;
  onAddCategory: () => void;
  onEditCategory: (category: BudgetCategory) => void;
}>) {
  if (categories.length === 0) {
    return (
      <EmptyState
        icon={WalletCards}
        title="No budget categories yet"
        description="Click Add Category to get started."
        action={{ label: 'Add Category', onClick: onAddCategory, icon: <Plus size={15} /> }}
        compact
        tone="neutral"
      />
    );
  }

  return (
    <div className="space-y-2 p-3">
      {categories.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          fmt={fmt}
          fmtDec={fmtDec}
          onEdit={onEditCategory}
        />
      ))}
    </div>
  );
}

export function BudgetCategoriesSection({
  categories,
  overBudget,
  fmt,
  fmtDec,
  selectedMonth,
  selectedYear,
  isCurrentMonth,
  onPrevMonth,
  onNextMonth,
  onAddCategory,
  onEditCategory,
}: Readonly<BudgetCategoriesSectionProps>) {
  const subtitle =
    overBudget.length > 0 ? `${overBudget.length} categories over budget` : undefined;

  return (
    <Card padding="none" className="overflow-hidden">
      <PanelHeader
        title="Budget Categories"
        subtitle={subtitle}
        className="max-md:flex-col max-md:items-start"
        actionClassName="max-md:w-full"
        action={
          <div className="flex flex-wrap items-center justify-end gap-3 max-md:w-full max-md:justify-between">
            <MonthYearSelector
              month={selectedMonth}
              year={selectedYear}
              isCurrentMonth={isCurrentMonth}
              onPrev={onPrevMonth}
              onNext={onNextMonth}
            />
            <Button
              data-testid="budget-add-category-button"
              onClick={onAddCategory}
              leadingIcon={<Plus size={15} />}
            >
              Add Category
            </Button>
          </div>
        }
      />
      <CategoryList
        categories={categories}
        fmt={fmt}
        fmtDec={fmtDec}
        onAddCategory={onAddCategory}
        onEditCategory={onEditCategory}
      />
    </Card>
  );
}
