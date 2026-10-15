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
      action={{ label: 'Add Your First Goal', onClick: onAdd, variant: 'secondary' }}
    />
  );
}
