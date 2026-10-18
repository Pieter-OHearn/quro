import { MAX_RISK_CLASS, MIN_RISK_CLASS, type ExposureView } from '@quro/shared';
import { Card, StatCard, StatsGrid } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ExposureFormat } from '../useExposureFormat';

const RISK_STEPS = Array.from(
  { length: MAX_RISK_CLASS - MIN_RISK_CLASS + 1 },
  (_, index) => MIN_RISK_CLASS + index,
);

/** The 1 to 7 scale with the portfolio's class marked. The class is also written out beside it. */
function RiskScale({ roundedClass }: Readonly<{ roundedClass: number }>) {
  return (
    <ol className="mt-2 flex gap-1" aria-hidden>
      {RISK_STEPS.map((step) => (
        <li
          key={step}
          className={cn(
            'flex h-5 flex-1 items-center justify-center rounded-sm border text-[11px] leading-none font-numeric',
            step === roundedClass
              ? 'border-brand bg-brand-soft font-semibold text-brand-fg'
              : 'border-border-default text-fg-subtle',
          )}
        >
          {step}
        </li>
      ))}
    </ol>
  );
}

function riskCaption(view: ExposureView): string {
  const risk = view.risk;
  if (!risk) return 'No holding has a risk class yet.';
  if (risk.holdingsWithoutRiskClass === 0) return 'From every holding, by value.';
  const covered = Math.round(risk.coverage);
  return `From ${covered}% of your investments; ${risk.holdingsWithoutRiskClass} ${
    risk.holdingsWithoutRiskClass === 1 ? 'holding has' : 'holdings have'
  } no risk class.`;
}

/** The headline figures: what is invested, how risky its mix is by default, how spread it is. */
export function SummaryCards({
  view,
  format,
}: Readonly<{ view: ExposureView; format: ExposureFormat }>) {
  const risk = view.risk;
  return (
    <Card className="space-y-4">
      <div>
        {view.statement ? (
          <p className="text-title-section text-fg" data-testid="exposure-statement">
            {view.statement}.
          </p>
        ) : null}
        {view.referenceStatement ? (
          <p className="mt-1 text-cell text-fg-muted">{view.referenceStatement}</p>
        ) : null}
      </div>
      <StatsGrid className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
        <StatCard
          label="Total invested"
          value={format.money(view.totalValue)}
          subtitle={`${view.holdings.length} ${view.holdings.length === 1 ? 'holding' : 'holdings'}, brokerage only`}
        />
        <div className="min-w-0 rounded-lg border border-border-default bg-surface px-4 py-3 max-sm:rounded-xl">
          <p className="text-label text-fg-muted">Weighted average risk class</p>
          <p className="mt-1 text-figure-lg text-fg" data-testid="exposure-risk">
            {risk ? `${risk.roundedClass} of ${MAX_RISK_CLASS}` : 'Not available'}
            {risk ? (
              <span className="ml-2 text-cell font-normal text-fg-muted">{risk.band}</span>
            ) : null}
          </p>
          {risk ? <RiskScale roundedClass={risk.roundedClass} /> : null}
          <p className="mt-1 text-caption text-fg-subtle">
            {risk ? `Average ${format.decimal(risk.average, 1)}. ` : ''}
            {riskCaption(view)}
          </p>
        </div>
        <StatCard
          label="Effective number of holdings"
          value={view.effectiveHoldings === null ? '—' : format.decimal(view.effectiveHoldings, 1)}
          subtitle={`Of ${view.holdings.length} holdings; 1 ÷ the sum of squared weights`}
        />
      </StatsGrid>
    </Card>
  );
}
