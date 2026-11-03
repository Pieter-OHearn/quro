import {
  MAX_RISK_CLASS,
  type ExposureHouseholdView,
  type ExposureNegativeRow,
  type ExposureView,
} from '@quro/shared';
import {
  Button,
  Card,
  ChartCard,
  StatCard,
  StatsGrid,
  buildChartAlternative,
} from '@/components/ui';
import type { ExposureFormat } from '../useExposureFormat';
import { Legend, StackedBar, type Segment } from './AllocationCard';

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

/** The total and the three figures it is made of. */
export function HouseholdSummary({
  view,
  format,
}: Readonly<{ view: ExposureHouseholdView; format: ExposureFormat }>) {
  return (
    <Card className="space-y-4">
      {view.statement ? (
        <p className="text-title-section text-fg" data-testid="exposure-household-statement">
          {view.statement}.
        </p>
      ) : null}
      <StatsGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <StatCard
          label="Total"
          value={format.money(view.totalValue)}
          subtitle="At your share, pensions not included"
          testId="exposure-household-total"
        />
        <StatCard
          label="Investments"
          value={format.money(view.investmentsValue)}
          subtitle={`${count(view.counts.holdings, 'holding', 'holdings')}, yours alone`}
        />
        <StatCard
          label="Savings accounts"
          value={format.money(view.savingsValue)}
          subtitle={`${count(view.counts.savingsAccounts, 'account', 'accounts')}, at your share`}
        />
        <StatCard
          label="Property equity"
          value={format.money(view.propertyValue)}
          subtitle={`${count(view.counts.properties, 'property', 'properties')}, value less mortgage`}
        />
      </StatsGrid>
    </Card>
  );
}

const NEGATIVE_LABEL: Record<ExposureNegativeRow['kind'], string> = {
  property: 'Negative equity',
  savings: 'Overdrawn',
};

function TotalRow({
  label,
  value,
  strong = false,
}: Readonly<{ label: string; value: string; strong?: boolean }>) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-cell">
      <dt className={strong ? 'font-semibold text-fg' : 'text-fg-muted'}>{label}</dt>
      <dd className={`font-numeric text-fg ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  );
}

/**
 * Positions below zero cannot be a share of a bar, so they are listed under it and the sum shows
 * how they come off the total.
 */
function NegativePositions({
  view,
  format,
}: Readonly<{ view: ExposureHouseholdView; format: ExposureFormat }>) {
  if (view.negative.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border-subtle pt-3" data-testid="exposure-negative">
      <h4 className="text-label text-fg-muted">Not in the bar, taken off the total</h4>
      <ul className="mt-2 space-y-1">
        {view.negative.map((row) => (
          <li
            key={`${row.kind}-${row.id}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-cell"
          >
            <span className="min-w-0 text-fg">
              {row.name}
              <span className="ml-2 text-caption text-fg-subtle">{NEGATIVE_LABEL[row.kind]}</span>
            </span>
            <span className="font-numeric text-fg">
              {format.money(row.value)}
              {row.currency === view.baseCurrency ? null : (
                <span className="ml-2 text-fg-subtle">
                  {format.native(row.nativeValue, row.currency)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-border-subtle pt-2">
        <TotalRow label="Assets in the bar" value={format.money(view.grossValue)} />
        <TotalRow label="Taken off" value={format.money(view.negativeValue)} />
        <TotalRow label="Total" value={format.money(view.totalValue)} strong />
      </dl>
    </div>
  );
}

function segmentsOf(view: ExposureHouseholdView): Segment[] {
  const segments: Segment[] = view.groups.map(({ key, label, share, value }) => ({
    key,
    label,
    share,
    value,
  }));
  if (view.unclassified.share > 0) {
    segments.push({ key: 'unclassified', label: 'Unclassified', ...view.unclassified });
  }
  return segments;
}

/** Everything by group. Shares are of the assets in the bar; no reference range applies here. */
export function HouseholdMixCard({
  view,
  format,
}: Readonly<{ view: ExposureHouseholdView; format: ExposureFormat }>) {
  const segments = segmentsOf(view);
  const alternative = buildChartAlternative({
    subject: 'Everything by group',
    xLabel: 'Group',
    ordered: false,
    x: (segment: Segment) => segment.label,
    rows: segments,
    columns: [
      { label: 'Share', value: (s) => s.share, format: format.percent },
      { label: 'Value', value: (s) => s.value, format: format.money },
    ],
    summary: `Everything by group: ${segments
      .map((segment) => `${segment.label} ${format.percent(segment.share)}`)
      .join(', ')}.`,
  });
  return (
    <ChartCard
      title="Mix by group"
      subtitle="Shares of your assets, at your share"
      hasData
      alternative={alternative}
    >
      {view.grossValue > 0 ? <StackedBar segments={segments} /> : null}
      <Legend segments={segments} format={format} />
      <p className="mt-3 text-caption text-fg-subtle">
        Cash is your savings accounts plus any cash funds in your brokerage. Property is what your
        properties are worth less their mortgages. A property fund in your brokerage stays with your
        investments, under Other assets.
      </p>
      <NegativePositions view={view} format={format} />
    </ChartCard>
  );
}

function InvestmentFigure({
  label,
  value,
  testId,
}: Readonly<{ label: string; value: string; testId?: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-cell">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-numeric text-fg" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The figures that only describe the brokerage. They stay labelled as such here, so none of them
 * reads as a figure about everything.
 */
export function InvestmentsOnlyCard({
  view,
  format,
  onOpenInvestments,
}: Readonly<{ view: ExposureView; format: ExposureFormat; onOpenInvestments: () => void }>) {
  const { risk } = view;
  return (
    <Card className="flex flex-col gap-3" data-testid="exposure-investments-only">
      <div>
        <h3 className="text-title-section text-fg">Investments only</h3>
        <p className="mt-1 text-cell text-fg-muted">
          Risk, concentration, sectors, asset classes and your holdings describe your brokerage, so
          they are on the Investments view.
        </p>
      </div>
      {view.status === 'ready' ? (
        <dl className="space-y-1">
          <InvestmentFigure
            label="Weighted average risk class"
            value={
              risk ? `${risk.roundedClass} of ${MAX_RISK_CLASS} · ${risk.band}` : 'Not available'
            }
          />
          <InvestmentFigure
            label="Effective number of holdings"
            value={
              view.effectiveHoldings === null
                ? '—'
                : `${format.decimal(view.effectiveHoldings, 1)} of ${view.holdings.length}`
            }
          />
          <InvestmentFigure
            label="Concentration notices"
            value={String(view.notices.length)}
            testId="exposure-investments-notices"
          />
        </dl>
      ) : null}
      <div className="mt-auto">
        <Button variant="secondary" onClick={onOpenInvestments}>
          Open Investments
        </Button>
      </div>
    </Card>
  );
}
