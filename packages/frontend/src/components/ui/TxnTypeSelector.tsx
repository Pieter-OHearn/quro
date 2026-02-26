import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TxnTypeMeta = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  borderColor: string;
};

type TxnTypeSelectorProps<T extends string> = {
  types: TxnTypeMeta[];
  value: T;
  onChange: (type: T) => void;
  columns?: 2 | 3 | 4;
};

export function TxnTypeSelector<T extends string>({
  types,
  value,
  onChange,
  columns = 3,
}: TxnTypeSelectorProps<T>) {
  return (
    <div
      className={cn(
        'grid gap-2',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        columns === 4 && 'grid-cols-4',
      )}
    >
      {types.map((t) => {
        const Icon = t.icon;
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key as T)}
            className={cn(
              'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all',
              active
                ? `${t.borderColor} ${t.bg} ${t.color}`
                : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            <Icon size={15} />
            <span className="text-[10px] font-semibold leading-tight text-center">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
