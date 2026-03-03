import { Home, Plus } from 'lucide-react';
import type { Mortgage as MortgageType } from '@quro/shared';

type MortgageTabSelectorProps = {
  mortgages: MortgageType[];
  activeMortgage: MortgageType;
  onSelect: (id: number | null) => void;
  onAddClick: () => void;
};

export function MortgageTabSelector({
  mortgages,
  activeMortgage,
  onSelect,
  onAddClick,
}: Readonly<MortgageTabSelectorProps>) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {mortgages.map((entry) => (
        <button
          key={entry.id}
          onClick={() => onSelect(entry.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
            activeMortgage.id === entry.id
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          <Home size={13} />
          <span className="max-w-[180px] truncate">{entry.propertyAddress.split(',')[0]}</span>
        </button>
      ))}
      <button
        onClick={onAddClick}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 text-sm font-medium transition-all"
      >
        <Plus size={14} /> Add Mortgage
      </button>
    </div>
  );
}
