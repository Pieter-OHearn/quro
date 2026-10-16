import { useId } from 'react';
import { Edit3 } from 'lucide-react';
import {
  formatNumber,
  holdingValue,
  sumMoney,
  unitPriceDecimals,
  type Holding,
  type NumberFormatPreference,
} from '@quro/shared';
import { Badge, Button, Change } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useCurrency } from '@/lib/CurrencyContext';
import { useUnitPriceFormatter, type UnitPriceFormatFn } from '../hooks/useUnitPriceFormatter';
import { getIncomeTxnLabels } from '../utils/incomeTxnLabels';
import type { Position } from '../utils/position';

type ConvertFn = (value: number, currency: string) => number;

/** The effective price of a holding: a manual price wins over the synced one. */
export function getEffectivePrice(holding: Holding): number {
  const manual = holding.manualPrice != null ? Number(holding.manualPrice) : null;
  return manual != null && Number.isFinite(manual) ? manual : holding.currentPrice;
}

type Measure = {
  key: string;
  label: string;
  kind: 'price' | 'amount' | 'gain';
  value: number;
};

/** The seven measures of a position, in the order the strip shows them. */
export function buildPositionMeasures(
  holding: Holding,
  position: Position,
  distributionsLabel = 'Distributions',
): Measure[] {
  const price = getEffectivePrice(holding);
  const marketValue = holdingValue(position.shares, price);
  return [
    { key: 'price', label: 'Price', kind: 'price', value: price },
    { key: 'avgCost', label: 'Avg cost', kind: 'price', value: position.avgCost },
    { key: 'value', label: 'Market value', kind: 'amount', value: marketValue },
    { key: 'cost', label: 'Cost basis', kind: 'amount', value: position.costBasis },
    {
      key: 'gain',
      label: 'Unrealized gain',
      kind: 'gain',
      value: sumMoney([marketValue, -position.costBasis]),
    },
    {
      key: 'distributions',
      label: distributionsLabel,
      kind: 'amount',
      value: position.totalDividends,
    },
    { key: 'realized', label: 'Realized gain', kind: 'gain', value: position.realizedGain },
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

type MeasureValueProps = Pick<
  HoldingPositionTableProps,
  'convertToBase' | 'fmtNative' | 'fmtPrice'
> & {
  measure: Measure;
  currency: string;
  decimals: number;
};

function renderMeasure(
  {
    measure,
    fmtNative,
    fmtPrice,
    decimals,
  }: Pick<MeasureValueProps, 'measure' | 'fmtNative' | 'fmtPrice' | 'decimals'>,
  value: number,
  currency: string,
  secondary = false,
) {
  if (measure.kind === 'price') return fmtPrice(value, currency, decimals);
  if (measure.kind === 'gain') {
    return (
      <Change
        format="amount"
        currency={currency}
        value={value}
        showArrow={false}
        className={secondary ? 'text-caption font-normal' : undefined}
      />
    );
  }
  return fmtNative(value, currency);
}

/**
 * One labelled figure. A foreign holding shows its own currency as the main value and the base
 * currency as a smaller line below it, each with a hidden currency cue so colour and size are not
 * the only signal.
 */
function MeasureCell({
  measure,
  currency,
  baseCurrency,
  foreign,
  convertToBase,
  fmtNative,
  fmtPrice,
  decimals,
}: Readonly<MeasureValueProps & { baseCurrency: string; foreign: boolean }>) {
  const shared = { measure, fmtNative, fmtPrice, decimals };
  return (
    <div className="min-w-0">
      <dt className="text-label text-fg-muted">{measure.label}</dt>
      <dd className="break-words font-numeric text-figure-md text-fg">
        {foreign ? <span className="sr-only">in {currency}: </span> : null}
        {renderMeasure(shared, measure.value, currency)}
        {foreign ? (
          <span className="block text-caption font-normal text-fg-muted">
            <span className="sr-only">in {baseCurrency}: </span>
            {renderMeasure(shared, convertToBase(measure.value, currency), baseCurrency, true)}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * One holding as a strip of measures in its own currency and, for a foreign holding, the base
 * currency beneath each. Base figures are converted at today's rate, because purchase-date rates
 * are not stored. Unit prices (price, average cost) share one precision: the decimals of the
 * holding's price, two to four; money amounts keep two.
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
  const headingId = useId();
  const foreign = holding.currency !== baseCurrency;
  const measures = buildPositionMeasures(holding, position, getIncomeTxnLabels(holding).plural);
  const decimals = unitPriceDecimals(getEffectivePrice(holding));

  return (
    <section
      aria-labelledby={headingId}
      className="border-b border-border-subtle px-3 py-3 max-sm:px-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={headingId} className="text-title-section text-fg">
            Position
            <span className="sr-only"> of {holding.name}</span>
          </h3>
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
          className="max-sm:min-h-11"
          leadingIcon={<Edit3 size={12} aria-hidden />}
          onClick={() => onEditHolding(holding)}
        >
          Correct holding
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 xl:grid-cols-7">
        {measures.map((measure) => (
          <MeasureCell
            key={measure.key}
            measure={measure}
            currency={holding.currency}
            baseCurrency={baseCurrency}
            foreign={foreign}
            convertToBase={convertToBase}
            fmtNative={fmtNative}
            fmtPrice={fmtPrice}
            decimals={decimals}
          />
        ))}
      </dl>
      <p className="mt-3 text-caption text-fg-subtle">
        {describePriceSource(holding, fmtPrice)}
        {foreign
          ? ` 1 ${holding.currency} = ${formatRate(convertToBase(1, holding.currency), numberFormat)} ${baseCurrency}${ratesUpdatedAt ? ` (rates updated ${formatDate(ratesUpdatedAt)})` : ''}. ${baseCurrency} figures convert cost at today's rate too; the rate at purchase is not stored.`
          : ''}
      </p>
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
