import type { MonthlySummaryItem } from '../types';

export function MonthlySummary({
  items,
}: Readonly<{
  items: readonly MonthlySummaryItem[];
}>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-2xl p-5 border ${item.bg} ${item.border} flex items-center gap-4`}
        >
          <span className="text-3xl">{item.icon}</span>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">{item.label}</p>
            <p className={`font-bold ${item.text}`}>{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
