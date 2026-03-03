import { Calendar, Home, Percent, TrendingDown } from 'lucide-react';
import { StatCard } from '@/components/ui';
import type { Mortgage as MortgageType } from '@quro/shared';
import type { MortgageFormatFn } from '../types';

const GOOD_LTV_THRESHOLD = 70;

type MortgageStatCardsProps = {
  mortgage: MortgageType;
  fmt: MortgageFormatFn;
  equity: number;
  ltv: number;
  paid: number;
  paidPct: number;
};

export function MortgageStatCards({
  mortgage,
  fmt,
  equity,
  ltv,
  paid,
  paidPct,
}: Readonly<MortgageStatCardsProps>) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Property Value"
        value={fmt(mortgage.propertyValue)}
        subtitle={`+${fmt(mortgage.propertyValue - mortgage.originalAmount)} since purchase`}
        icon={Home}
        color="emerald"
      />
      <StatCard
        label="Equity Built"
        value={fmt(equity)}
        subtitle={`${((equity / mortgage.propertyValue) * 100).toFixed(0)}% of property value`}
        icon={TrendingDown}
        color="indigo"
      />
      <StatCard
        label="Loan-to-Value"
        value={`${ltv.toFixed(1)}%`}
        subtitle={ltv < GOOD_LTV_THRESHOLD ? `Good — below ${GOOD_LTV_THRESHOLD}%` : 'High LTV'}
        icon={Percent}
        color="sky"
      />
      <StatCard
        label="Capital Repaid"
        value={fmt(paid)}
        subtitle={`${paidPct.toFixed(0)}% of original loan`}
        icon={Calendar}
        color="amber"
      />
    </div>
  );
}
