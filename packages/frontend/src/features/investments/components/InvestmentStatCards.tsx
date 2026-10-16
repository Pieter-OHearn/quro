import { toCents } from '@quro/shared';
import { Change, StatCard, StatsGrid, type StatCardNumericChange } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import type {
  InvestmentFormatFn,
  InvestmentPortfolioStats,
  InvestmentStatTrend,
  InvestmentStatTrends,
} from '../types';

type InvestmentStatCardsProps = InvestmentPortfolioStats & {
  fmtBase: InvestmentFormatFn;
  trends: InvestmentStatTrends;
};

const MINUS_SIGN = '\u2212';

/**
 * The card value is text, so the sign is written here: a gain reads "Unrealized gain" with a plus,
 * a loss "Unrealized loss" with a true minus, and zero (to the cent) has no sign.
 */
function describeUnrealized(totalGainBase: number, fmtBase: InvestmentFormatFn) {
  const cents = toCents(totalGainBase);
  let sign = '';
  if (cents > 0) sign = '+';
  else if (cents < 0) sign = MINUS_SIGN;
  return {
    label: cents < 0 ? 'Unrealized loss' : 'Unrealized gain',
    value: `${sign}${fmtBase(Math.abs(totalGainBase))}`,
  };
}

function toCardChange(trend: InvestmentStatTrend, currency: string): StatCardNumericChange {
  return { ...trend, format: 'amount', currency };
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
  const unrealized = describeUnrealized(totalGainBase, fmtBase);
  return (
    <StatsGrid>
      <StatCard
        label="Brokerage value"
        value={fmtBase(totalBrokerageBase)}
        valueClassName="text-figure-hero"
        subtitle="Total portfolio value in base currency"
        change={toCardChange(trends.brokerageValue, baseCurrency)}
      />
      <StatCard
        label={unrealized.label}
        value={unrealized.value}
        subtitle={`Cost basis ${fmtBase(totalCostBase)}`}
        change={toCardChange(trends.unrealizedGain, baseCurrency)}
      />
      <StatCard
        label="Dividends"
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
        change={toCardChange(trends.dividendsReceived, baseCurrency)}
      />
      <StatCard
        label="Property equity"
        value={fmtBase(totalPropertyEquityBase)}
        subtitle={`Your share after mortgages · ${fmtBase(totalRentalBase)}/mo rental`}
        change={toCardChange(trends.propertyEquity, baseCurrency)}
      />
    </StatsGrid>
  );
}
