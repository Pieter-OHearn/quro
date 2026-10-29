import { Edit3 } from 'lucide-react';
import type { Mortgage as MortgageType } from '@quro/shared';
import { Button, Card } from '@/components/ui';
import { JointBadge } from '@/features/partner';
import type { MortgageFormatFn } from '../types';
import { formatAsNegative } from '@/lib/liability';
import { expectedNextPayment } from '../utils/mortgage-metrics';

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
  // A linear loan's payment falls with its interest, so it is worked out from today's balance.
  const isLinear = mortgage.repaymentType === 'Linear';
  return [
    {
      label: isLinear ? 'Current payment' : 'Monthly payment',
      value: fmt(isLinear ? expectedNextPayment(mortgage) : mortgage.monthlyPayment),
      sub: isLinear ? 'Declines as interest falls' : 'Fixed total payment',
    },
    {
      label: 'Interest rate',
      value: `${mortgage.interestRate}%`,
      sub: `${mortgage.rateType} (until ${mortgage.fixedUntil ?? 'N/A'})`,
    },
    { label: 'Years remaining', value: `${yearsRemaining} yrs`, sub: `~${monthsRemaining} months` },
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
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-title-section text-fg">
              {mortgage.propertyAddress ?? mortgage.lender}
            </h2>
            <JointBadge isJoint={mortgage.isJoint} ownerUserId={mortgage.userId} />
          </div>
          <p className="text-caption text-fg-subtle">
            {mortgage.lender} · {mortgage.repaymentType} · {mortgage.rateType} Rate · Fixed until{' '}
            {mortgage.fixedUntil ?? 'N/A'}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onEdit}
          leadingIcon={<Edit3 size={12} aria-hidden />}
          className="shrink-0"
        >
          Edit
        </Button>
      </div>
      <div className="mt-4">
        <p className="text-label text-fg-muted">Outstanding balance</p>
        <p className="mt-1 text-figure-hero font-numeric text-fg">
          {formatAsNegative(fmt, mortgage.outstandingBalance)}
        </p>
        <p className="text-caption text-fg-subtle">of {fmt(mortgage.originalAmount)} original</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 lg:grid-cols-4">
        {metrics.map(({ label, value, sub }) => (
          <div key={label} className="min-w-0">
            <dt className="text-label text-fg-muted">{label}</dt>
            <dd className="mt-0.5 text-figure-md font-numeric text-fg">{value}</dd>
            <dd className="text-caption text-fg-subtle">{sub}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
