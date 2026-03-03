import { Plus, Target } from 'lucide-react';
import type { FilterKey } from '../types';

type GoalsEmptyStateProps = {
  activeFilter: FilterKey;
  activeYear: number;
  onAdd: () => void;
};

export function GoalsEmptyState({
  activeFilter,
  activeYear,
  onAdd,
}: Readonly<GoalsEmptyStateProps>) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
        <Target size={22} className="text-slate-300" />
      </div>
      <p className="font-semibold text-slate-500 mb-1">
        No {activeFilter !== 'all' ? `${activeFilter} ` : ''}goals for {activeYear}
      </p>
      <p className="text-sm text-slate-400 mb-4">
        Add a goal to start tracking your financial progress.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-colors"
      >
        <Plus size={14} /> Add Your First Goal
      </button>
    </div>
  );
}
