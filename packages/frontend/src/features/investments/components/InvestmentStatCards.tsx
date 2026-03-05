import { BarChart2, Building2, DollarSign, TrendingUp } from 'lucide-react';
import { StatCard } from '@/components/ui';
import type { InvestmentFormatFn, InvestmentPortfolioStats, InvestmentStatTrends } from '../types';

type InvestmentStatCardsProps = InvestmentPortfolioStats & {
  fmtBase: InvestmentFormatFn;
  trends: InvestmentStatTrends;
};

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
        label="Unrealized Gain"
        value={`${totalGainBase >= 0 ? '+' : ''}${fmtBase(Math.abs(totalGainBase))}`}
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
        label="Property Equity"
        value={fmtBase(totalPropertyEquityBase)}
        subtitle={`${fmtBase(totalRentalBase)}/mo rental`}
        icon={Building2}
        color="amber"
        change={trends.propertyEquity}
      />
    </div>
  );
}
