import { Calendar, Home, Percent, TrendingDown } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
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
  const { numberFormat } = useCurrency();
  const valueChange = mortgage.propertyValue - mortgage.originalAmount;
  return (
    <StatsGrid>
      <StatCard
        label="Property Value"
        value={fmt(mortgage.propertyValue)}
        change={{
          value: valueChange >= 0 ? `+${fmt(valueChange)}` : fmt(valueChange),
          positive: valueChange >= 0,
        }}
        subtitle="since purchase"
        icon={Home}
        color="emerald"
      />
      <StatCard
        label="Equity Built"
        value={fmt(equity)}
        subtitle={`${formatPercent((equity / mortgage.propertyValue) * 100, numberFormat, 0)} of property value`}
        icon={TrendingDown}
        color="indigo"
      />
      <StatCard
        label="Loan-to-Value"
        value={formatPercent(ltv, numberFormat, 1)}
        subtitle={ltv < GOOD_LTV_THRESHOLD ? `Good — below ${GOOD_LTV_THRESHOLD}%` : 'High LTV'}
        icon={Percent}
        color="sky"
      />
      <StatCard
        label="Capital Repaid"
        value={fmt(paid)}
        subtitle={`${formatPercent(paidPct, numberFormat, 0)} of original loan`}
        icon={Calendar}
        color="amber"
      />
    </StatsGrid>
  );
}
