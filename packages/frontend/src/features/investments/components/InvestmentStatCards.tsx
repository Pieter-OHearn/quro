import { BarChart2, Building2, DollarSign, TrendingUp } from 'lucide-react';
import { Change, StatCard, StatsGrid } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import type { InvestmentFormatFn, InvestmentPortfolioStats, InvestmentStatTrends } from '../types';

type InvestmentStatCardsProps = InvestmentPortfolioStats & {
  fmtBase: InvestmentFormatFn;
  trends: InvestmentStatTrends;
};

const MINUS_SIGN = '\u2212';

/**
 * A gain as stat card text: a plus or a true minus sign, none when it formats as zero. The card
 * value is text, so `Change` cannot render it; the change line under it carries the colour.
 */
function formatSignedFigure(value: number, fmtBase: InvestmentFormatFn): string {
  const magnitude = fmtBase(Math.abs(value));
  if (magnitude === fmtBase(0)) return magnitude;
  return `${value > 0 ? '+' : MINUS_SIGN}${magnitude}`;
}

export function InvestmentStatCards({
  totalBrokerageBase,
  totalCostBase,
  totalGainBase,
  totalDividendsBase,
  totalRealizedBase,
  totalPropertyEquityBase,
  totalRentalBase,
  fmtBase,
  trends,
}: InvestmentStatCardsProps) {
  const { baseCurrency } = useCurrency();
  return (
    <StatsGrid>
      <StatCard
        label="Brokerage value"
        value={fmtBase(totalBrokerageBase)}
        valueClassName="text-figure-hero"
        subtitle="Total portfolio value in base currency"
        icon={BarChart2}
        color="indigo"
        change={trends.brokerageValue}
      />
      <StatCard
        label="Unrealized gain"
        value={formatSignedFigure(totalGainBase, fmtBase)}
        subtitle={`Cost basis ${fmtBase(totalCostBase)}`}
        icon={TrendingUp}
        color="emerald"
        change={trends.unrealizedGain}
      />
      <StatCard
        label="Dividends received"
        value={`+${fmtBase(totalDividendsBase)}`}
        subtitle={
          <>
            <Change
              value={totalRealizedBase}
              format="amount"
              currency={baseCurrency}
              showArrow={false}
              className="text-caption font-normal"
            />{' '}
            realized
          </>
        }
        icon={DollarSign}
        color="sky"
        change={trends.dividendsReceived}
      />
      <StatCard
        label="Your property equity"
        value={fmtBase(totalPropertyEquityBase)}
        subtitle={`Your share after mortgages · ${fmtBase(totalRentalBase)}/mo rental`}
        icon={Building2}
        color="amber"
        change={trends.propertyEquity}
      />
    </StatsGrid>
  );
}
