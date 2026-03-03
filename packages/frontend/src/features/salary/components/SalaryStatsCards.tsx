import type { SalaryStatCard } from '../types';

export function SalaryStatsCards({ cards }: Readonly<{ cards: readonly SalaryStatCard[] }>) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, sub, icon: Icon, color }) => (
        <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div
            className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${
              color === 'indigo'
                ? 'bg-indigo-50 text-indigo-600'
                : color === 'emerald'
                  ? 'bg-emerald-50 text-emerald-600'
                  : color === 'rose'
                    ? 'bg-rose-50 text-rose-500'
                    : 'bg-amber-50 text-amber-600'
            }`}
          >
            <Icon size={18} />
          </div>
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <p className="font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-400 mt-1">{sub}</p>
        </div>
      ))}
    </div>
  );
}
