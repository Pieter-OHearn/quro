import { BarChart2, Building2 } from 'lucide-react';
import type { Tab } from '../types';

type TabSwitcherProps = {
  tab: Tab;
  onSetTab: (tab: Tab) => void;
};

export function TabSwitcher({ tab, onSetTab }: TabSwitcherProps) {
  return (
    <div className="flex border-b border-slate-100">
      <button
        onClick={() => onSetTab('brokerage')}
        className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
          tab === 'brokerage'
            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <BarChart2 size={16} /> Brokerage Holdings
      </button>
      <button
        onClick={() => onSetTab('property')}
        className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
          tab === 'property'
            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <Building2 size={16} /> Property Portfolio
      </button>
    </div>
  );
}
