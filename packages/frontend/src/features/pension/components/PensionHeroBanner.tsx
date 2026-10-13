import type { PensionPot } from '@quro/shared';
import { Card } from '@/components/ui';
import type { PensionFormatBaseFn } from '../types';

type PensionHeroBannerProps = {
  pensions: PensionPot[];
  totalInBase: number;
  projected: number | null;
  yearsToRetirement: number | null;
  fmtBase: PensionFormatBaseFn;
  baseCurrency: string;
};

/** The page's headline: the total balance, with the projection at retirement beside it. */
export function PensionHeroBanner({
  pensions,
  totalInBase,
  projected,
  yearsToRetirement,
  fmtBase,
  baseCurrency,
}: Readonly<PensionHeroBannerProps>) {
  const currencyCount = new Set(pensions.map((pot) => pot.currency)).size;
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-label text-fg-muted">Total balance</p>
        <p className="text-figure-hero text-fg">{fmtBase(totalInBase)}</p>
        <p className="text-caption text-fg-subtle">
          in {baseCurrency} · {pensions.length} pension pots across {currencyCount} currencies
        </p>
      </div>
      <div className="min-w-0 sm:text-right">
        <p className="text-label text-fg-muted">
          {yearsToRetirement == null ? 'Projection' : `In ${yearsToRetirement} years`}
        </p>
        <p className="text-figure-lg text-fg">{projected == null ? '—' : fmtBase(projected)}</p>
        <p className="text-caption text-fg-subtle">
          {projected == null ? 'Needs profile retirement settings' : 'Projected from current data'}
        </p>
      </div>
    </Card>
  );
}
