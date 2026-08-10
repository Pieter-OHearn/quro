import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toBudgetMonthIndex, type BudgetCategory, type ExpenseClass } from '@quro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tags } from 'lucide-react';
import { Button, Card, SelectInput } from '@/components/ui';
import { api } from '@/lib/api';
import { PLAN_QUERY_KEY } from '../hooks';

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
    <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
      {categories.map((category) => (
        <div key={category.id} className="flex items-center justify-between gap-4 py-3">
          <span className="text-sm font-medium text-slate-700">
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
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: ['budget', 'categories', 'all'],
    queryFn: async () => {
      const response = await api.get('/api/budget/categories');
      return response.data.data as BudgetCategory[];
    },
  });
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
  const classify = useMutation({
    mutationFn: async () => {
      const updates = categories.map((category) => ({
        id: category.id,
        expenseClass: classes[category.id] ?? 'essential',
      }));
      return api.patch('/api/budget/categories/classify', { updates });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['budget'] }),
      ]);
    },
  });

  if (categoriesQuery.isPending || categories.length === 0) return null;
  return (
    <Card className="border-slate-200">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            <span className="rounded-xl bg-slate-100 p-2 text-slate-600">
              <Tags size={18} />
            </span>
            <span>
              <span className="block font-semibold text-slate-900">Review spending classes</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {defaultedCount > 0
                  ? `${defaultedCount} custom categories currently use the conservative essential default.`
                  : 'Mark work-linked spending so it drops out of job-loss burn.'}
              </span>
            </span>
          </span>
          <span className="text-xs font-semibold text-indigo-600">Review all</span>
        </summary>
        <ClassificationRows categories={categories} classes={classes} setClasses={setClasses} />
        {classify.isError ? (
          <p className="mt-3 text-sm text-rose-600">Spending classes could not be saved.</p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => classify.mutate()} loading={classify.isPending}>
            Save spending classes
          </Button>
        </div>
      </details>
    </Card>
  );
}
