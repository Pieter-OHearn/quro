import type { RunwayResponse } from '@quro/shared';
import { Badge, Button, Card } from '@/components/ui';
import { formatMonths, RUNWAY_BAND_META, RUNWAY_CITATIONS } from '../utils/runway-display';

export function RunwayHeroCard({
  data,
  onReview,
}: Readonly<{ data: RunwayResponse; onReview: () => void }>) {
  const band = RUNWAY_BAND_META[data.runway.band];
  return (
    <Card className="overflow-hidden border-brand-border bg-gradient-to-br from-brand-soft via-surface to-info-soft p-0">
      <div className="grid gap-6 p-6 md:grid-cols-[1.25fr_1fr] md:p-8">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Income-stop runway
            </p>
            <Badge tone={band.badgeTone}>{band.label}</Badge>
          </div>
          <p className="mt-4 text-4xl font-bold tracking-tight text-fg md:text-5xl">
            {data.isEstimated ? '~' : ''}
            {formatMonths(data.runway.monthsWithIncomeSupport)}
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-muted">
            A month-by-month estimate using lean spending, accessible balances, notice pay,
            severance, and applicable income support.
          </p>
          <p className="mt-4 text-xs text-fg-subtle">{RUNWAY_CITATIONS.band}</p>
          <Button
            className="mt-5"
            variant="secondary"
            size="sm"
            onClick={onReview}
            aria-label="Review runway calculation"
          >
            Review calculation
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 self-stretch">
          <div className="rounded-2xl border border-border-subtle bg-surface/85 p-4 shadow-card">
            <p className="text-xs text-fg-subtle">Cash only</p>
            <p className="mt-2 text-xl font-bold text-fg">
              {formatMonths(data.runway.monthsCashOnly)}
            </p>
          </div>
          <div className="rounded-2xl border border-border-subtle bg-surface/85 p-4 shadow-card">
            <p className="text-xs text-fg-subtle">All liquid</p>
            <p className="mt-2 text-xl font-bold text-fg">
              {formatMonths(data.runway.monthsAllLiquid)}
            </p>
          </div>
          <div className="col-span-2 rounded-2xl border border-border-subtle bg-surface/85 p-4 shadow-card">
            <p className="text-xs text-fg-subtle">Model basis</p>
            <p className="mt-1 text-sm font-semibold text-fg-strong">
              {data.jurisdiction.code} · rates from {data.jurisdiction.rulesEffectiveFrom}
            </p>
            {data.jurisdiction.isExtrapolated ? (
              <p className="mt-1 text-xs text-warning-fg">Latest known rules carried forward.</p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
