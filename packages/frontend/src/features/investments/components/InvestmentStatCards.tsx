import { BarChart2, Building2, DollarSign, TrendingUp } from 'lucide-react';
import { StatCard } from '@/components/ui';
import type { InvestmentFormatFn, InvestmentPortfolioStats } from '../types';

type InvestmentStatCardsProps = InvestmentPortfolioStats & {
  fmtBase: InvestmentFormatFn;
};

function BrokerageStatCards({
  totalBrokerageBase,
  totalGainBase,
  totalCostBase,
  gainPct,
  fmtBase,
}: InvestmentStatCardsProps) {
  return (
    <>
      <StatCard
        label="Brokerage Value"
        value={fmtBase(totalBrokerageBase)}
        subtitle={`${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% unrealized`}
        icon={BarChart2}
        color="indigo"
        change={{
          value: `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`,
          positive: gainPct >= 0,
        }}
      />
      <StatCard
        label="Unrealized Gain"
        value={`${totalGainBase >= 0 ? '+' : ''}${fmtBase(Math.abs(totalGainBase))}`}
        subtitle={`Cost basis ${fmtBase(totalCostBase)}`}
        icon={TrendingUp}
        color="emerald"
        change={{
          value: `${totalGainBase >= 0 ? '+' : ''}${fmtBase(Math.abs(totalGainBase), undefined, true)}`,
          positive: totalGainBase >= 0,
        }}
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
  ...brokerage
}: InvestmentStatCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <BrokerageStatCards
        {...brokerage}
        totalDividendsBase={totalDividendsBase}
        totalRealizedBase={totalRealizedBase}
        totalPropertyEquityBase={totalPropertyEquityBase}
        totalRentalBase={totalRentalBase}
        fmtBase={fmtBase}
      />
      <StatCard
        label="Dividends Received"
        value={`+${fmtBase(totalDividendsBase)}`}
        subtitle={`${totalRealizedBase >= 0 ? '+' : ''}${fmtBase(totalRealizedBase)} realized`}
        icon={DollarSign}
        color="sky"
        change={{
          value: `${totalRealizedBase >= 0 ? '+' : ''}${fmtBase(Math.abs(totalRealizedBase), undefined, true)}`,
          positive: totalRealizedBase >= 0,
        }}
      />
      <StatCard
        label="Property Equity"
        value={fmtBase(totalPropertyEquityBase)}
        subtitle={`${fmtBase(totalRentalBase)}/mo rental`}
        icon={Building2}
        color="amber"
        change={{
          value: `${fmtBase(totalRentalBase, undefined, true)}/mo`,
          positive: totalRentalBase >= 0,
        }}
      />
    </div>
  );
}
