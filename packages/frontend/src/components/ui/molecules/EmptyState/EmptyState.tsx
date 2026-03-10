import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
        <Icon size={28} className="text-indigo-300" />
      </div>
      <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-xs">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
        >
          <Plus size={15} /> {action.label}
        </button>
      )}
    </div>
  );
}
