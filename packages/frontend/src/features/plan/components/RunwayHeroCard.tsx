import type { RunwayResponse } from '@quro/shared';
import { Badge, Button, Card } from '@/components/ui';
import { formatMonths, RUNWAY_BAND_META, RUNWAY_CITATIONS } from '../utils/runway-display';

export function RunwayHeroCard({
  data,
  onReview,
}: Readonly<{ data: RunwayResponse; onReview: () => void }>) {
  const band = RUNWAY_BAND_META[data.runway.band];
  return (
    <Card>
      <div className="grid gap-4 md:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-label text-fg-muted">Income-stop runway</p>
            <Badge tone={band.badgeTone}>{band.label}</Badge>
          </div>
          <p className="mt-1 text-figure-hero font-numeric text-fg">
            {data.isEstimated ? '~' : ''}
            {formatMonths(data.runway.monthsWithIncomeSupport)}
          </p>
          <p className="mt-2 max-w-2xl text-body text-fg-muted">
            A month-by-month estimate using lean spending, accessible balances, notice pay,
            severance, and applicable income support.
          </p>
          <p className="mt-2 text-caption text-fg-subtle">{RUNWAY_CITATIONS.band}</p>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            onClick={onReview}
            aria-label="Review runway calculation"
          >
            Review calculation
          </Button>
        </div>
        <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-3 border-t border-border-subtle pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
          <div>
            <dt className="text-label text-fg-muted">Cash only</dt>
            <dd className="mt-1 text-figure-lg font-numeric text-fg">
              {formatMonths(data.runway.monthsCashOnly)}
            </dd>
          </div>
          <div>
            <dt className="text-label text-fg-muted">All liquid</dt>
            <dd className="mt-1 text-figure-lg font-numeric text-fg">
              {formatMonths(data.runway.monthsAllLiquid)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-label text-fg-muted">Model basis</dt>
            <dd className="mt-1 text-cell font-medium text-fg">
              {data.jurisdiction.code}
              {data.jurisdiction.rulesEffectiveFrom
                ? ` · rates from ${data.jurisdiction.rulesEffectiveFrom}`
                : ''}
            </dd>
            {data.jurisdiction.isExtrapolated ? (
              <dd className="mt-1 text-caption text-warning">
                Latest known rules carried forward.
              </dd>
            ) : null}
          </div>
        </dl>
      </div>
    </Card>
  );
}
