import { Home, Plus } from 'lucide-react';
import type { Mortgage as MortgageType } from '@quro/shared';
import { SegmentedControl } from '@/components/ui';

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
      <SegmentedControl
        options={mortgages.map((entry) => ({
          value: entry.id,
          label: (
            <span className="max-w-[180px] truncate">{entry.propertyAddress.split(',')[0]}</span>
          ),
          icon: <Home size={13} />,
        }))}
        value={activeMortgage.id}
        onChange={onSelect}
        variant="pill"
        tone="indigo"
      />
      <button
        type="button"
        onClick={onAddClick}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 text-sm font-medium transition-all"
      >
        <Plus size={14} /> Add Mortgage
      </button>
    </div>
  );
}
