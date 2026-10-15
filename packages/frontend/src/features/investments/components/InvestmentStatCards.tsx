import { BarChart2, Building2, DollarSign, TrendingUp } from 'lucide-react';
import { toCents } from '@quro/shared';
import { StatCard, StatsGrid } from '@/components/ui';
import type { InvestmentFormatFn, InvestmentPortfolioStats, InvestmentStatTrends } from '../types';

type InvestmentStatCardsProps = InvestmentPortfolioStats & {
  fmtBase: InvestmentFormatFn;
  trends: InvestmentStatTrends;
};

const MINUS_SIGN = '\u2212';

// A loss reads as "Unrealized Loss" with a minus sign; zero (to the cent) has no sign.
function describeUnrealized(totalGainBase: number, fmtBase: InvestmentFormatFn) {
  const cents = toCents(totalGainBase);
  const sign = cents > 0 ? '+' : cents < 0 ? MINUS_SIGN : '';
  return {
    label: cents < 0 ? 'Unrealized Loss' : 'Unrealized Gain',
    value: `${sign}${fmtBase(Math.abs(totalGainBase))}`,
  };
}

type BrokerageStatCardsProps = Pick<
  InvestmentPortfolioStats,
  'totalBrokerageBase' | 'totalCostBase' | 'totalGainBase'
> & {
  fmtBase: InvestmentFormatFn;
  trends: InvestmentStatTrends;
};

function BrokerageStatCards({
  totalBrokerageBase,
  totalCostBase,
  totalGainBase,
  fmtBase,
  trends,
}: BrokerageStatCardsProps) {
  const unrealized = describeUnrealized(totalGainBase, fmtBase);
  return (
    <>
      <StatCard
        label="Brokerage Value"
        value={fmtBase(totalBrokerageBase)}
        subtitle={`Total portfolio value in base currency`}
        icon={BarChart2}
        color="indigo"
        change={trends.brokerageValue}
      />
      <StatCard
        label={unrealized.label}
        value={unrealized.value}
        subtitle={`Cost basis ${fmtBase(totalCostBase)}`}
        icon={TrendingUp}
        color="emerald"
        change={trends.unrealizedGain}
      />
    </>
  );
}

export function InvestmentStatCards({
  totalDividendsBase,
  totalRealizedBase,
  totalPropertyEquityBase,
  totalRentalBase,
  fmtBase,
  trends,
  ...brokerage
}: InvestmentStatCardsProps) {
  return (
    <StatsGrid>
      <BrokerageStatCards {...brokerage} fmtBase={fmtBase} trends={trends} />
      <StatCard
        label="Dividends Received"
        value={`+${fmtBase(totalDividendsBase)}`}
        subtitle={`${totalRealizedBase >= 0 ? '+' : ''}${fmtBase(totalRealizedBase)} realized`}
        icon={DollarSign}
        color="sky"
        change={trends.dividendsReceived}
      />
      <StatCard
        label="Your Property Equity"
        value={fmtBase(totalPropertyEquityBase)}
        subtitle={`Your share after mortgages · ${fmtBase(totalRentalBase)}/mo rental`}
        icon={Building2}
        color="amber"
        change={trends.propertyEquity}
      />
    </StatsGrid>
  );
}
