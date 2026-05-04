import type { Debt } from '@quro/shared';
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
    <div className="flex flex-wrap items-center gap-2">
      {visibleOptions.map((option) => {
        const Icon = option.icon;
        const isActive = option.key === value;
        const count = getFilterCount(option.key, debts);

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Icon size={11} />
            {option.label}
            {option.key !== 'all' ? (
              <span
                className={`rounded-full px-1 text-[9px] font-semibold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
