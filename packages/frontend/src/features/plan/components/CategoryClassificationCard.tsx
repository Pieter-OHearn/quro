import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toBudgetMonthIndex, type BudgetCategory, type ExpenseClass } from '@quro/shared';
import { Tags } from 'lucide-react';
import { Button, Card, SelectInput, StateNotice } from '@/components/ui';
import { useAllBudgetCategories, useClassifyBudgetCategories } from '../hooks';

const CLASS_OPTIONS = [
  { value: 'essential', label: 'Essential' },
  { value: 'discretionary', label: 'Discretionary' },
  { value: 'employment_linked', label: 'Employment-linked' },
] as const;

function newestCategories(categories: readonly BudgetCategory[]): BudgetCategory[] {
  const byName = new Map<string, BudgetCategory>();
  for (const category of categories) {
    const existing = byName.get(category.name);
    const candidateKey = category.year * 12 + toBudgetMonthIndex(category.month);
    const existingKey = existing ? existing.year * 12 + toBudgetMonthIndex(existing.month) : -1;
    if (!existing || candidateKey > existingKey) byName.set(category.name, category);
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function ClassificationRows({
  categories,
  classes,
  setClasses,
}: Readonly<{
  categories: readonly BudgetCategory[];
  classes: Readonly<Record<number, ExpenseClass>>;
  setClasses: Dispatch<SetStateAction<Record<number, ExpenseClass>>>;
}>) {
  return (
    <div className="mt-5 divide-y divide-border-subtle border-t border-border-subtle">
      {categories.map((category) => (
        <div key={category.id} className="flex items-center justify-between gap-4 py-3">
          <span className="text-cell font-medium text-fg">
            {category.emoji} {category.name}
          </span>
          <SelectInput
            className="max-w-48"
            value={classes[category.id] ?? 'essential'}
            onChange={(value) =>
              setClasses((current) => ({ ...current, [category.id]: value as ExpenseClass }))
            }
            options={CLASS_OPTIONS}
          />
        </div>
      ))}
    </div>
  );
}

export function CategoryClassificationCard({
  defaultedCount,
}: Readonly<{ defaultedCount: number }>) {
  const categoriesQuery = useAllBudgetCategories();
  const categories = useMemo(
    () => newestCategories(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  );
  const [classes, setClasses] = useState<Record<number, ExpenseClass>>({});
  useEffect(() => {
    setClasses(
      Object.fromEntries(
        categories.map((category) => [category.id, category.expenseClass ?? 'essential']),
      ),
    );
  }, [categories]);
  const classify = useClassifyBudgetCategories();

  if (categoriesQuery.isPending) return null;
  if (categoriesQuery.isError && categories.length === 0) {
    return (
      <StateNotice
        tone="danger"
        title="Spending classes could not be loaded"
        action={{
          label: 'Retry',
          onClick: () => void categoriesQuery.refetch(),
          loading: categoriesQuery.isFetching,
        }}
      >
        The runway uses each category&apos;s class, so review them once they load.
      </StateNotice>
    );
  }
  if (categories.length === 0) return null;
  return (
    <Card>
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          <span className="flex items-start gap-2">
            <Tags size={16} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
            <span>
              <span className="block text-title-section text-fg">Review spending classes</span>
              <span className="mt-0.5 block text-caption text-fg-subtle">
                {defaultedCount > 0
                  ? `${defaultedCount} custom categories currently use the conservative essential default.`
                  : 'Mark work-linked spending so it drops out of job-loss burn.'}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-cell font-medium text-brand">Review all</span>
        </summary>
        <ClassificationRows categories={categories} classes={classes} setClasses={setClasses} />
        {classify.isError ? (
          <p className="mt-3 text-cell text-danger">Spending classes could not be saved.</p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() =>
              classify.mutate(
                categories.map((category) => ({
                  id: category.id,
                  expenseClass: classes[category.id] ?? 'essential',
                })),
              )
            }
            loading={classify.isPending}
          >
            Save spending classes
          </Button>
        </div>
      </details>
    </Card>
  );
}
