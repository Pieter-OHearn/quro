import { Banknote } from 'lucide-react';
import { EmptyState } from '@/components/ui';

export function DebtsEmptyState({ onAdd }: Readonly<{ onAdd: () => void }>) {
  return (
    <EmptyState
      icon={Banknote}
      title="No debts recorded"
      description="Track student loans, credit cards, personal loans, car loans, overdrafts, and other liabilities to see their impact on net worth."
      action={{
        label: 'Add your first debt',
        onClick: onAdd,
        className: 'bg-rose-600 hover:bg-rose-700',
      }}
    />
  );
}
