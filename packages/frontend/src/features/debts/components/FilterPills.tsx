import type { Debt } from '@quro/shared';
import { SegmentedControl } from '@/components/ui';
import type { DebtFilterValue } from '../types';
import { FILTER_OPTIONS } from '../constants';

type FilterPillsProps = {
  debts: readonly Debt[];
  value: DebtFilterValue;
  onChange: (value: DebtFilterValue) => void;
};

function getFilterCount(option: DebtFilterValue, debts: readonly Debt[]): number {
  return option === 'all' ? debts.length : debts.filter((debt) => debt.type === option).length;
}

export function FilterPills({ debts, value, onChange }: Readonly<FilterPillsProps>) {
  const visibleOptions = FILTER_OPTIONS.filter(
    (option) => option.key === 'all' || debts.some((debt) => debt.type === option.key),
  );

  return (
    <SegmentedControl
      aria-label="Filter debts"
      value={value}
      onChange={onChange}
      options={visibleOptions.map((option) => {
        const Icon = option.icon;
        return {
          value: option.key,
          label: option.label,
          icon: <Icon size={12} aria-hidden />,
          badge:
            option.key === 'all' ? undefined : (
              <span className="font-numeric text-fg-subtle">
                {getFilterCount(option.key, debts)}
              </span>
            ),
        };
      })}
    />
  );
}
