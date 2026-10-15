import { formatCurrency } from '@quro/shared';
import { Card, Change, PanelHeader, ProgressMeter, QuroLogo } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PREVIEW_BARS, PREVIEW_STATS } from '../utils/landing-data';

// Example figures for the marketing preview; they are not anyone's data.
const PREVIEW_NET_WORTH = 487250;
const PREVIEW_MONTHLY_CHANGE = 12340;
const PREVIEW_BUDGET_USED_PERCENT = 68;

function eur(value: number): string {
  return formatCurrency(value, 'EUR');
}

/** A single-series bar chart: the brand colour on the latest month, its soft tint before it. */
function PreviewChart() {
  return (
    <div className="mt-4">
      <div className="flex h-16 items-end gap-1 border-b border-chart-grid">
        {PREVIEW_BARS.map((bar, index) => (
          <div
            key={bar.id}
            className={cn(
              'flex-1 rounded-t-sm',
              index === PREVIEW_BARS.length - 1 ? 'bg-brand' : 'bg-brand-soft',
            )}
            style={{ height: `${bar.height}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] leading-4 text-chart-axis">
        <span>Mar 2025</span>
        <span>Feb 2026</span>
      </div>
    </div>
  );
}

function PreviewRows() {
  return (
    <ul className="border-t border-border-default">
      {PREVIEW_STATS.map(({ label, value, dotClassName }) => (
        <li
          key={label}
          className="flex h-7 items-center gap-2 border-b border-border-subtle px-3 text-cell last:border-b-0"
        >
          <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClassName)} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-fg-muted">{label}</span>
          <span className="text-figure-cell text-fg">{eur(value)}</span>
        </li>
      ))}
    </ul>
  );
}

function PreviewBudget() {
  return (
    <div className="border-t border-border-default px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-cell">
        <span className="text-fg-muted">Budget this month</span>
        <span className="font-numeric text-fg">{PREVIEW_BUDGET_USED_PERCENT}% used</span>
      </div>
      <ProgressMeter
        value={PREVIEW_BUDGET_USED_PERCENT}
        label="Budget used this month"
        indicatorClassName="bg-brand"
      />
    </div>
  );
}

/** A small, static copy of the dashboard: the hero figure, its change and compact rows. */
export function AppPreview() {
  return (
    <Card padding="none" className="mx-auto w-full max-w-md overflow-hidden">
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            <QuroLogo size={16} />
            Dashboard
          </span>
        }
        subtitle="Example household"
      />
      <div className="p-4">
        <p className="text-label text-fg-muted">Total net worth</p>
        <p className="mt-1 text-figure-hero text-fg">{eur(PREVIEW_NET_WORTH)}</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <Change value={PREVIEW_MONTHLY_CHANGE} format="amount" currency="EUR" />
          <span className="text-caption text-fg-subtle">this month</span>
        </p>
        <PreviewChart />
      </div>
      <PreviewRows />
      <PreviewBudget />
    </Card>
  );
}
