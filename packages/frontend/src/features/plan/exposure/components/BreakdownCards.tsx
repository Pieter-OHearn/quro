import { ASSET_CLASS_LABELS, type ExposureView } from '@quro/shared';
import { Badge, ChartCard, buildChartAlternative } from '@/components/ui';
import { assetClassBarClass } from '../exposureStyle';
import type { ExposureFormat } from '../useExposureFormat';
import { BarList, type BarListRow } from './BarList';

type Row = { key: string; label: string; share: number; value: number };

function altFor(subject: string, xLabel: string, rows: readonly Row[], format: ExposureFormat) {
  return buildChartAlternative({
    subject,
    xLabel,
    ordered: false,
    x: (row: Row) => row.label,
    rows,
    columns: [
      { label: 'Share', value: (row) => row.share, format: format.percent },
      { label: 'Value', value: (row) => row.value, format: format.money },
    ],
  });
}

/** Holdings per asset class, coloured by the group the class belongs to; unclassified is dashed. */
export function AssetClassCard({
  view,
  format,
}: Readonly<{ view: ExposureView; format: ExposureFormat }>) {
  const rows: Row[] = view.assetClasses.map((row) => ({
    key: row.key,
    label: ASSET_CLASS_LABELS[row.key],
    share: row.share,
    value: row.value,
  }));
  const barRows: BarListRow[] = view.assetClasses.map((row) => ({
    key: row.key,
    label: ASSET_CLASS_LABELS[row.key],
    caption: `${row.holdingCount} ${row.holdingCount === 1 ? 'holding' : 'holdings'}`,
    share: row.share,
    shareText: format.percent(row.share),
    valueText: format.money(row.value),
    barClassName: assetClassBarClass(row.key),
  }));
  return (
    <ChartCard
      title="By asset class"
      subtitle="Largest first"
      hasData={rows.length > 0}
      alternative={altFor('Investments by asset class', 'Asset class', rows, format)}
    >
      <BarList rows={barRows} />
    </ChartCard>
  );
}

export function CurrencyCard({
  view,
  format,
}: Readonly<{ view: ExposureView; format: ExposureFormat }>) {
  const rows: Row[] = view.currencies.map((row) => ({
    key: row.key,
    label: row.label,
    share: row.share,
    value: row.value,
  }));
  const barRows: BarListRow[] = view.currencies.map((row) => ({
    key: row.key,
    label: row.label,
    share: row.share,
    shareText: format.percent(row.share),
    valueText: format.money(row.value),
    barClassName: 'bg-viz-2',
  }));
  return (
    <ChartCard
      title="By currency"
      subtitle="The currency each holding is priced in"
      hasData={rows.length > 0}
      alternative={altFor('Investments by currency', 'Currency', rows, format)}
    >
      <BarList rows={barRows} />
    </ChartCard>
  );
}

export function SectorCard({
  view,
  format,
}: Readonly<{ view: ExposureView; format: ExposureFormat }>) {
  const rows: Row[] = view.sectors.map((row) => ({
    key: row.key,
    label: row.label,
    share: row.share,
    value: row.value,
  }));
  const barRows: BarListRow[] = view.sectors.map((row) => ({
    key: row.key,
    label: (
      <>
        {row.label}
        {row.generic ? (
          <Badge tone="muted" className="ml-2 align-middle">
            Broad
          </Badge>
        ) : null}
      </>
    ),
    share: row.share,
    shareText: format.percent(row.share),
    valueText: format.money(row.value),
    barClassName: 'bg-viz-2',
  }));
  return (
    <ChartCard
      title="By sector"
      subtitle="As recorded on each holding"
      hasData={rows.length > 0}
      alternative={altFor('Investments by sector', 'Sector', rows, format)}
      footer={
        view.sectors.some((row) => row.generic) ? (
          <p className="mt-3 text-caption text-fg-subtle">
            Broad labels such as Diversified describe a fund&apos;s breadth, so they are not checked
            for concentration.
          </p>
        ) : undefined
      }
    >
      <BarList rows={barRows} />
    </ChartCard>
  );
}
