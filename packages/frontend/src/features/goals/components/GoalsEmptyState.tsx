import { Target } from 'lucide-react';
import { EmptyState } from '@/components/ui';
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
    <EmptyState
      icon={Target}
      title={`No ${activeFilter !== 'all' ? `${activeFilter} ` : ''}goals for ${activeYear}`}
      description="Add a goal to start tracking your financial progress."
      tone="neutral"
      className="rounded-2xl border border-dashed border-slate-200 bg-white p-12"
      titleClassName="text-slate-500"
      descriptionClassName="mb-4"
      action={{ label: 'Add Your First Goal', onClick: onAdd }}
    />
  );
}
