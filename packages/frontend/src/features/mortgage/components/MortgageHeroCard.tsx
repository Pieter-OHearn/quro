import { Edit3, Home } from 'lucide-react';
import type { Mortgage as MortgageType } from '@quro/shared';
import type { MortgageFormatFn } from '../types';

type MortgageHeroCardProps = {
  mortgage: MortgageType;
  fmt: MortgageFormatFn;
  yearsRemaining: number;
  monthsRemaining: number;
  onEdit: () => void;
};

function buildMortgageMetrics(
  mortgage: MortgageType,
  fmt: MortgageFormatFn,
  yearsRemaining: number,
  monthsRemaining: number,
) {
  return [
    {
      label: 'Outstanding Balance',
      value: fmt(mortgage.outstandingBalance),
      sub: `of ${fmt(mortgage.originalAmount)} original`,
    },
    { label: 'Monthly Payment', value: fmt(mortgage.monthlyPayment), sub: 'Capital + Interest' },
    {
      label: 'Interest Rate',
      value: `${mortgage.interestRate}%`,
      sub: `${mortgage.rateType} (until ${mortgage.fixedUntil})`,
    },
    { label: 'Years Remaining', value: `${yearsRemaining} yrs`, sub: `~${monthsRemaining} months` },
  ];
}

export function MortgageHeroCard({
  mortgage,
  fmt,
  yearsRemaining,
  monthsRemaining,
  onEdit,
}: Readonly<MortgageHeroCardProps>) {
  const metrics = buildMortgageMetrics(mortgage, fmt, yearsRemaining, monthsRemaining);

  return (
    <div className="bg-gradient-to-br from-[#0a0f1e] to-[#1a2040] rounded-2xl p-6 text-white">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <Home size={22} />
          </div>
          <div>
            <h2 className="font-bold text-lg">{mortgage.propertyAddress}</h2>
            <p className="text-slate-400 text-sm">
              {mortgage.lender} · {mortgage.rateType} Rate · Fixed until {mortgage.fixedUntil}
            </p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-xl transition-all flex-shrink-0"
        >
          <Edit3 size={12} /> Edit
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metrics.map(({ label, value, sub }) => (
          <div key={label} className="bg-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className="font-bold text-white">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
