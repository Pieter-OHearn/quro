import type { RunwayResponse } from '@quro/shared';
import { Badge, Card } from '@/components/ui';
import { formatMonths, RUNWAY_BAND_META, RUNWAY_CITATIONS } from '../utils/runway-display';

export function RunwayHeroCard({ data }: Readonly<{ data: RunwayResponse }>) {
  const band = RUNWAY_BAND_META[data.runway.band];
  return (
    <Card className="overflow-hidden border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-0">
      <div className="grid gap-6 p-6 md:grid-cols-[1.25fr_1fr] md:p-8">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">
              Income-stop runway
            </p>
            <Badge tone={band.badgeTone}>{band.label}</Badge>
          </div>
          <p className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
            {data.isEstimated ? '~' : ''}
            {formatMonths(data.runway.monthsWithIncomeSupport)}
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            A month-by-month estimate using lean spending, accessible balances, notice pay,
            severance, and applicable income support.
          </p>
          <p className="mt-4 text-xs text-slate-500">{RUNWAY_CITATIONS.band}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 self-stretch">
          <div className="rounded-2xl border border-white bg-white/85 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Cash only</p>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {formatMonths(data.runway.monthsCashOnly)}
            </p>
          </div>
          <div className="rounded-2xl border border-white bg-white/85 p-4 shadow-sm">
            <p className="text-xs text-slate-500">All liquid</p>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {formatMonths(data.runway.monthsAllLiquid)}
            </p>
          </div>
          <div className="col-span-2 rounded-2xl border border-white bg-white/85 p-4 shadow-sm">
            <p className="text-xs text-slate-500">Model basis</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {data.jurisdiction.code} · rates from {data.jurisdiction.rulesEffectiveFrom}
            </p>
            {data.jurisdiction.isExtrapolated ? (
              <p className="mt-1 text-xs text-amber-700">Latest known rules carried forward.</p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
