import { Edit3, Plus, WalletCards } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Button, Card, EmptyState, IconButton, PanelHeader, ProgressMeter } from '@/components/ui';
import { dataColorToken } from '@/lib/dataColors';
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

const MINUS_SIGN = '\u2212';

function CategoryProgress({
  category,
  over,
  pct,
}: Readonly<{ category: BudgetCategory; over: boolean; pct: number }>) {
  const meterStyle = {
    '--category-color': over ? 'var(--loss)' : dataColorToken(category.color),
  } as CSSProperties;
  return (
    <ProgressMeter
      value={over ? 100 : pct}
      label={`${category.name} spent`}
      style={meterStyle}
      indicatorClassName="bg-(--category-color)"
    />
  );
}

// Over budget reads as a loss, money left as a gain, and nothing left with no sign.
function describeSurplus(over: boolean, surplus: number, fmt: BudgetFormatFn) {
  if (over) return { text: `${MINUS_SIGN}${fmt(Math.abs(surplus))}`, tone: 'text-loss' };
  if (surplus === 0) return { text: `${fmt(surplus)} left`, tone: 'text-flat' };
  return { text: `+${fmt(surplus)} left`, tone: 'text-gain' };
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
  const remaining = describeSurplus(over, surplus, fmt);
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-cell font-numeric md:justify-end">
      <span className="text-fg-muted">
        {fmtDec(spent)} / {fmt(budgeted)}
      </span>
      <span className={cn('font-medium', remaining.tone)}>{remaining.text}</span>
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
    <div className="flex items-center gap-2 px-3 py-2 transition-colors duration-fast hover:bg-surface-muted max-sm:px-4">
      <span className="w-5 shrink-0 text-center text-base leading-none" aria-hidden>
        {category.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-0.5 md:flex-row md:items-baseline md:justify-between md:gap-3">
          <p className="truncate text-cell font-medium text-fg">{category.name}</p>
          <CategoryAmounts
            over={over}
            spent={category.spent}
            surplus={surplus}
            budgeted={category.budgeted}
            fmt={fmt}
            fmtDec={fmtDec}
          />
        </div>
        <div className="mt-1.5">
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
  );
}

function CategoryList({
  categories,
  fmt,
  fmtDec,
  onEditCategory,
}: Readonly<{
  categories: BudgetCategory[];
  fmt: BudgetFormatFn;
  fmtDec: BudgetFormatFn;
  onEditCategory: (category: BudgetCategory) => void;
}>) {
  if (categories.length === 0) {
    // The header's Add Category button is the one action, so the empty state has none.
    return (
      <div className="p-3 max-sm:p-4">
        <EmptyState
          icon={WalletCards}
          title="No budget categories yet"
          description="Click Add Category to get started."
          compact
          tone="neutral"
        />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-subtle">
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
        className="max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:py-2"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2 max-md:w-full max-md:justify-between">
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
              size="sm"
              leadingIcon={<Plus size={12} aria-hidden />}
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
        onEditCategory={onEditCategory}
      />
    </Card>
  );
}
