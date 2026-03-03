import { Edit3, Plus } from 'lucide-react';
import type { BudgetCategory, BudgetFormatFn, NewCategoryForm } from '../types';

type BudgetCategoriesSectionProps = {
  categories: BudgetCategory[];
  overBudget: BudgetCategory[];
  showAdd: boolean;
  newCat: NewCategoryForm;
  baseCurrency: string;
  fmt: BudgetFormatFn;
  fmtDec: BudgetFormatFn;
  onToggleAdd: () => void;
  onNewCatChange: (value: NewCategoryForm) => void;
  onAddCategory: () => void;
};

type AddCategoryFormProps = {
  newCat: NewCategoryForm;
  baseCurrency: string;
  onChange: (value: NewCategoryForm) => void;
  onAdd: () => void;
};

function AddCategoryForm({
  newCat,
  baseCurrency,
  onChange,
  onAdd,
}: Readonly<AddCategoryFormProps>) {
  return (
    <div className="mb-5 p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex gap-3">
      <input
        className="flex-1 rounded-xl border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        placeholder="Category name"
        value={newCat.name}
        onChange={(event) => onChange({ ...newCat, name: event.target.value })}
      />
      <input
        className="w-36 rounded-xl border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        placeholder={`Budget (${baseCurrency})`}
        type="number"
        value={newCat.budgeted}
        onChange={(event) => onChange({ ...newCat, budgeted: event.target.value })}
      />
      <button
        onClick={onAdd}
        className="rounded-xl bg-indigo-600 text-white text-sm px-4 py-2 hover:bg-indigo-700 transition-colors"
      >
        Add
      </button>
    </div>
  );
}

function CategoryRow({
  category,
  fmt,
  fmtDec,
}: Readonly<{ category: BudgetCategory; fmt: BudgetFormatFn; fmtDec: BudgetFormatFn }>) {
  const pct = category.budgeted > 0 ? Math.min((category.spent / category.budgeted) * 100, 100) : 0;
  const over = category.spent > category.budgeted;
  const surplus = category.budgeted - category.spent;

  return (
    <div
      className={`p-3 rounded-xl transition-colors ${over ? 'bg-rose-50 border border-rose-100' : 'hover:bg-slate-50'}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl w-8 text-center">{category.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-slate-800">{category.name}</p>
            <div className="flex items-center gap-3 text-xs">
              <span className={over ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                {fmtDec(category.spent)} / {fmt(category.budgeted)}
              </span>
              {over ? (
                <span className="text-rose-500 font-semibold">-{fmt(Math.abs(surplus))}</span>
              ) : (
                <span className="text-emerald-600">+{fmt(surplus)} left</span>
              )}
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${over ? 100 : pct}%`,
                backgroundColor: over ? '#f43f5e' : category.color,
              }}
            />
          </div>
        </div>
        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
          <Edit3 size={13} />
        </button>
      </div>
    </div>
  );
}

function CategorySectionHeader({
  overBudget,
  onToggleAdd,
}: Readonly<{ overBudget: BudgetCategory[]; onToggleAdd: () => void }>) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h3 className="font-semibold text-slate-900">Budget Categories</h3>
        {overBudget.length > 0 && (
          <p className="text-xs text-rose-500 mt-0.5">{overBudget.length} categories over budget</p>
        )}
      </div>
      <button
        onClick={onToggleAdd}
        className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
      >
        <Plus size={15} /> Add Category
      </button>
    </div>
  );
}

function CategoryList({
  categories,
  fmt,
  fmtDec,
}: Readonly<{ categories: BudgetCategory[]; fmt: BudgetFormatFn; fmtDec: BudgetFormatFn }>) {
  return (
    <div className="space-y-2">
      {categories.map((category) => (
        <CategoryRow key={category.id} category={category} fmt={fmt} fmtDec={fmtDec} />
      ))}
      {categories.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">
          No budget categories yet. Click <strong>Add Category</strong> to get started.
        </p>
      )}
    </div>
  );
}

export function BudgetCategoriesSection({
  categories,
  overBudget,
  showAdd,
  newCat,
  baseCurrency,
  fmt,
  fmtDec,
  onToggleAdd,
  onNewCatChange,
  onAddCategory,
}: Readonly<BudgetCategoriesSectionProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <CategorySectionHeader overBudget={overBudget} onToggleAdd={onToggleAdd} />
      {showAdd && (
        <AddCategoryForm
          newCat={newCat}
          baseCurrency={baseCurrency}
          onChange={onNewCatChange}
          onAdd={onAddCategory}
        />
      )}
      <CategoryList categories={categories} fmt={fmt} fmtDec={fmtDec} />
    </div>
  );
}
