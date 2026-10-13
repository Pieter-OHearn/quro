import { Home, Plus } from 'lucide-react';
import type { Mortgage as MortgageType } from '@quro/shared';
import { Button, SegmentedControl } from '@/components/ui';

type MortgageTabSelectorProps = {
  mortgages: MortgageType[];
  activeMortgage: MortgageType;
  onSelect: (id: number | null) => void;
  onAddClick: () => void;
  addLabel?: string;
};

export function MortgageTabSelector({
  mortgages,
  activeMortgage,
  onSelect,
  onAddClick,
  addLabel = 'Add Mortgage',
}: Readonly<MortgageTabSelectorProps>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        aria-label="Mortgages"
        options={mortgages.map((entry) => ({
          value: entry.id,
          label: (
            <span className="max-w-[180px] truncate">{entry.propertyAddress.split(',')[0]}</span>
          ),
          icon: <Home size={13} aria-hidden />,
        }))}
        value={activeMortgage.id}
        onChange={onSelect}
        className="max-sm:w-full"
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={onAddClick}
        leadingIcon={<Plus size={12} aria-hidden />}
        className="max-sm:w-full"
      >
        {addLabel}
      </Button>
    </div>
  );
}
