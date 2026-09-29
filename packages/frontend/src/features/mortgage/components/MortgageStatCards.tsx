import { Calendar, Home, Percent, TrendingDown } from 'lucide-react';
import { StatCard, StatsGrid } from '@/components/ui';
import { formatPercent, type Mortgage as MortgageType } from '@quro/shared';
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
    <StatsGrid>
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
        subtitle={`${formatPercent((equity / mortgage.propertyValue) * 100, 0)} of property value`}
        icon={TrendingDown}
        color="indigo"
      />
      <StatCard
        label="Loan-to-Value"
        value={formatPercent(ltv, 1)}
        subtitle={ltv < GOOD_LTV_THRESHOLD ? `Good — below ${GOOD_LTV_THRESHOLD}%` : 'High LTV'}
        icon={Percent}
        color="sky"
      />
      <StatCard
        label="Capital Repaid"
        value={fmt(paid)}
        subtitle={`${formatPercent(paidPct, 0)} of original loan`}
        icon={Calendar}
        color="amber"
      />
    </StatsGrid>
  );
}
