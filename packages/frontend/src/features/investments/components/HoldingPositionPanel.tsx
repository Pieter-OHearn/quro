import { Edit3 } from 'lucide-react';
import {
  formatNumber,
  holdingValue,
  sumMoney,
  type Holding,
  type NumberFormatPreference,
} from '@quro/shared';
import { Badge, Button, Change } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useCurrency } from '@/lib/CurrencyContext';
import { useUnitPriceFormatter, type UnitPriceFormatFn } from '../hooks/useUnitPriceFormatter';
import type { Position } from '../utils/position';

type ConvertFn = (value: number, currency: string) => number;

type PositionRow = {
  key: string;
  label: string;
  native: { kind: 'price' | 'amount' | 'gain'; value: number };
};

/** The effective price of a holding: a manual price wins over the synced one. */
export function getEffectivePrice(holding: Holding): number {
  const manual = holding.manualPrice != null ? Number(holding.manualPrice) : null;
  return manual != null && Number.isFinite(manual) ? manual : holding.currentPrice;
}

export function buildPositionRows(holding: Holding, position: Position): PositionRow[] {
  const price = getEffectivePrice(holding);
  const marketValue = holdingValue(position.shares, price);
  return [
    { key: 'price', label: 'Price per unit', native: { kind: 'price', value: price } },
    { key: 'avgCost', label: 'Avg cost', native: { kind: 'price', value: position.avgCost } },
    { key: 'value', label: 'Market value', native: { kind: 'amount', value: marketValue } },
    { key: 'cost', label: 'Cost basis', native: { kind: 'amount', value: position.costBasis } },
    {
      key: 'gain',
      label: 'Unrealized gain',
      native: { kind: 'gain', value: sumMoney([marketValue, -position.costBasis]) },
    },
  ];
}

/** Where the price comes from, so a manual or an old price is never mistaken for a live one. */
export function describePriceSource(holding: Holding, fmtPrice: UnitPriceFormatFn): string {
  if (holding.manualPrice != null) {
    return `Manual price in use. The synced price is ${fmtPrice(holding.currentPrice, holding.currency)}.`;
  }
  if (holding.excludeFromSync) return 'Price sync is off for this holding; update it by hand.';
  if (holding.priceUpdatedAt) {
    const date = new Date(holding.priceUpdatedAt);
    if (!Number.isNaN(date.getTime()))
      return `Price synced on ${formatDate(holding.priceUpdatedAt)}.`;
  }
  return 'No price sync date is recorded.';
}

type HoldingPositionTableProps = {
  holding: Holding;
  position: Position;
  baseCurrency: string;
  numberFormat: NumberFormatPreference;
  ratesUpdatedAt: string | null;
  convertToBase: ConvertFn;
  fmtNative: (amount: number, currency: string) => string;
  fmtPrice: UnitPriceFormatFn;
  onEditHolding: (holding: Holding) => void;
};

function formatRate(rate: number, numberFormat: NumberFormatPreference): string {
  return formatNumber(rate, numberFormat, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

type PositionValueTableProps = Pick<
  HoldingPositionTableProps,
  'holding' | 'baseCurrency' | 'convertToBase' | 'fmtNative' | 'fmtPrice'
> & { rows: readonly PositionRow[]; foreign: boolean };

function PositionValueTable({
  holding,
  rows,
  foreign,
  baseCurrency,
  convertToBase,
  fmtNative,
  fmtPrice,
}: Readonly<PositionValueTableProps>) {
  const renderValue = (kind: PositionRow['native']['kind'], value: number, currency: string) => {
    if (kind === 'price') return fmtPrice(value, currency);
    if (kind === 'gain') return <Change format="amount" currency={currency} value={value} />;
    return fmtNative(value, currency);
  };

  return (
    <table className="w-full max-w-xl text-cell">
      <thead>
        <tr className="text-label text-fg-muted">
          <th scope="col" className="py-1 text-left font-medium">
            Measure
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {holding.currency}
          </th>
          {foreign ? (
            <th scope="col" className="py-1 pl-3 text-right font-medium">
              {baseCurrency}
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, label, native }) => (
          <tr key={key}>
            <th scope="row" className="py-0.5 text-left font-normal text-fg-muted">
              {label}
            </th>
            <td className="py-0.5 text-right font-numeric">
              {renderValue(native.kind, native.value, holding.currency)}
            </td>
            {foreign ? (
              <td className="py-0.5 pl-3 text-right font-numeric">
                {renderValue(
                  native.kind,
                  convertToBase(native.value, holding.currency),
                  baseCurrency,
                )}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One holding in its own currency and, for a foreign holding, in the base currency beside it.
 * Base figures are converted at today's rate, because purchase-date rates are not stored.
 */
export function HoldingPositionTable({
  holding,
  position,
  baseCurrency,
  numberFormat,
  ratesUpdatedAt,
  convertToBase,
  fmtNative,
  fmtPrice,
  onEditHolding,
}: Readonly<HoldingPositionTableProps>) {
  const foreign = holding.currency !== baseCurrency;
  const rows = buildPositionRows(holding, position);

  return (
    <section
      aria-label={`${holding.name} position`}
      className="border-b border-border-subtle px-3 py-3 max-sm:px-4"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-label text-fg-muted">Position</h3>
          {holding.manualPrice != null ? (
            <Badge tone="warning" size="xs">
              Manual price
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<Edit3 size={12} aria-hidden />}
          onClick={() => onEditHolding(holding)}
        >
          Correct holding
        </Button>
      </div>
      <PositionValueTable
        holding={holding}
        rows={rows}
        foreign={foreign}
        baseCurrency={baseCurrency}
        convertToBase={convertToBase}
        fmtNative={fmtNative}
        fmtPrice={fmtPrice}
      />
      <p className="mt-2 text-caption text-fg-subtle">{describePriceSource(holding, fmtPrice)}</p>
      {foreign ? (
        <p className="mt-1 text-caption text-fg-subtle">
          1 {holding.currency} = {formatRate(convertToBase(1, holding.currency), numberFormat)}{' '}
          {baseCurrency}
          {ratesUpdatedAt ? ` (rates updated ${formatDate(ratesUpdatedAt)})` : ''}. {baseCurrency}{' '}
          figures convert cost at today&apos;s rate too; the rate at purchase is not stored.
        </p>
      ) : null}
    </section>
  );
}

export function HoldingPositionPanel({
  holding,
  position,
  onEditHolding,
}: Readonly<Pick<HoldingPositionTableProps, 'holding' | 'position' | 'onEditHolding'>>) {
  const { baseCurrency, numberFormat, ratesUpdatedAt, convertToBase, fmtNative } = useCurrency();
  const fmtPrice = useUnitPriceFormatter();

  return (
    <HoldingPositionTable
      holding={holding}
      position={position}
      baseCurrency={baseCurrency}
      numberFormat={numberFormat}
      ratesUpdatedAt={ratesUpdatedAt}
      convertToBase={convertToBase}
      fmtNative={fmtNative}
      fmtPrice={fmtPrice}
      onEditHolding={onEditHolding}
    />
  );
}
