import { Edit3, Home } from 'lucide-react';
import type { Mortgage as MortgageType } from '@quro/shared';
import { JointBadge } from '@/features/partner';
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
  const annualAllowance = (mortgage.outstandingBalance * mortgage.overpaymentLimit) / 100;
  const hasAllowance = Number.isFinite(annualAllowance) && annualAllowance > 0;
  return [
    {
      label: 'Outstanding Balance',
      value: fmt(mortgage.outstandingBalance),
      sub: `of ${fmt(mortgage.originalAmount)} original`,
    },
    {
      label: mortgage.repaymentType === 'Linear' ? 'Current Payment' : 'Monthly Payment',
      value: fmt(mortgage.monthlyPayment),
      sub:
        mortgage.repaymentType === 'Linear' ? 'Declines as interest falls' : 'Fixed total payment',
    },
    {
      label: 'Interest Rate',
      value: `${mortgage.interestRate}%`,
      sub: `${mortgage.rateType} (until ${mortgage.fixedUntil})`,
    },
    { label: 'Years Remaining', value: `${yearsRemaining} yrs`, sub: `~${monthsRemaining} months` },
    {
      label: 'Penalty-free allowance',
      value: hasAllowance ? `${mortgage.overpaymentLimit}% per year` : 'Not recorded',
      sub: hasAllowance ? `Contract maximum: ${fmt(annualAllowance)}` : 'Check your mortgage terms',
    },
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
    <div className="bg-gradient-to-br from-surface-inverse to-surface-mortgage-end rounded-2xl p-6 text-fg-inverted">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-surface/10 flex items-center justify-center flex-shrink-0">
            <Home size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-lg">{mortgage.propertyAddress}</h2>
              <JointBadge isJoint={mortgage.isJoint} ownerUserId={mortgage.userId} />
            </div>
            <p className="text-fg-faint text-sm">
              {mortgage.lender} · {mortgage.repaymentType} · {mortgage.rateType} Rate · Fixed until{' '}
              {mortgage.fixedUntil}
            </p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs text-fg-faint hover:text-fg-inverted border border-fg-inverted/20 hover:border-fg-inverted/40 px-3 py-1.5 rounded-xl transition-all flex-shrink-0"
        >
          <Edit3 size={12} /> Edit
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {metrics.map(({ label, value, sub }) => (
          <div key={label} className="bg-surface/10 rounded-xl p-4">
            <p className="text-xs text-fg-faint mb-1">{label}</p>
            <p className="font-bold text-fg-inverted">{value}</p>
            <p className="text-xs text-fg-faint mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
