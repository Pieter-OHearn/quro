import { useCurrency } from '@/lib/CurrencyContext';
import { StatCard, StatsGrid } from '@/components/ui';
import { formatPercent, type Mortgage as MortgageType } from '@quro/shared';
import type { MortgageFormatFn } from '../types';

const GOOD_LTV_THRESHOLD = 70;

type MortgageStatCardsProps = {
  mortgage: MortgageType;
  fmt: MortgageFormatFn;
  /** The linked property's equity as net worth counts it; null without a linked property. */
  equity: number | null;
  totalEquity: number | null;
  ltv: number | null;
  paid: number;
  paidPct: number;
};

const NO_PROPERTY = 'No linked property';

function ltvSubtitle(ltv: number | null): string {
  if (ltv == null) return NO_PROPERTY;
  return ltv < GOOD_LTV_THRESHOLD ? `Good — below ${GOOD_LTV_THRESHOLD}%` : 'High LTV';
}

function valueChangeOf(propertyValue: number, originalAmount: number, fmt: MortgageFormatFn) {
  const change = propertyValue - originalAmount;
  return { value: change >= 0 ? `+${fmt(change)}` : fmt(change), positive: change >= 0 };
}

export function MortgageStatCards({
  mortgage,
  fmt,
  equity,
  totalEquity,
  ltv,
  paid,
  paidPct,
}: Readonly<MortgageStatCardsProps>) {
  const { numberFormat } = useCurrency();
  const propertyValue = mortgage.propertyValue;
  return (
    <StatsGrid>
      <StatCard
        label="Property value"
        value={propertyValue == null ? '—' : fmt(propertyValue)}
        change={
          propertyValue == null
            ? undefined
            : valueChangeOf(propertyValue, mortgage.originalAmount, fmt)
        }
        subtitle={propertyValue == null ? NO_PROPERTY : 'since purchase'}
      />
      <StatCard
        label={mortgage.isJoint ? 'Your equity (50%)' : 'Equity built'}
        value={equity == null ? '—' : fmt(equity)}
        subtitle={
          totalEquity == null || !propertyValue
            ? NO_PROPERTY
            : `${formatPercent((totalEquity / propertyValue) * 100, numberFormat, 0)} of property value`
        }
      />
      <StatCard
        label="Loan-to-Value"
        value={ltv == null ? '—' : formatPercent(ltv, numberFormat, 1)}
        subtitle={ltvSubtitle(ltv)}
      />
      <StatCard
        label="Capital repaid"
        value={fmt(paid)}
        subtitle={`${formatPercent(paidPct, numberFormat, 0)} of original loan`}
      />
    </StatsGrid>
  );
}
