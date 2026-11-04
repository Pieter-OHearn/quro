import { formatDate } from '@/lib/utils';
import type { ExposureReport } from '@quro/shared';
import { StateNotice } from '@/components/ui';
import type { ExposureFormat } from '../useExposureFormat';

function listNames(names: readonly string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

const EXCLUDED_REASON = {
  no_price: 'has no usable price',
  no_fx_rate: 'has no stored exchange rate',
} as const;

/**
 * What is wrong with the data behind the figures, said plainly and above them: holdings that
 * could not be valued (and so are not in any total), prices and exchange rates that are old, an
 * unreadable saved setting, and holdings still unclassified.
 */
export function DataStateNotices({
  report,
  format,
  onClassify,
}: Readonly<{ report: ExposureReport; format: ExposureFormat; onClassify: () => void }>) {
  const { view, facts, settings } = report;
  const staleHoldings = view.holdings.filter((row) => row.priceStale).map((row) => row.name);
  const staleRates = facts.inputs.fxRates.filter(
    (rate) => rate.stale && view.holdings.some((row) => row.currency === rate.currency),
  );
  return (
    <div className="space-y-2" data-testid="exposure-data-state">
      {settings.storedInvalid ? (
        <StateNotice tone="warning" title="Your saved settings could not be read">
          The defaults are in use. Saving in Customise replaces the unreadable settings.
        </StateNotice>
      ) : null}
      {view.excluded.length > 0 ? (
        <StateNotice
          tone="warning"
          title={`${view.excluded.length} ${view.excluded.length === 1 ? 'holding is' : 'holdings are'} left out of the figures`}
          testId="exposure-excluded"
        >
          <ul className="list-disc pl-4">
            {view.excluded.map((row) => (
              <li key={row.id}>
                {row.name} ({row.currency}) {EXCLUDED_REASON[row.reason]}. It is not valued at a
                guess, so it is in no total, share or average.
              </li>
            ))}
          </ul>
        </StateNotice>
      ) : null}
      {staleHoldings.length > 0 ? (
        <StateNotice tone="warning" title="Some prices have not synced for over a week">
          {listNames(staleHoldings)}: values use the last synced price.
        </StateNotice>
      ) : null}
      {staleRates.length > 0 ? (
        <StateNotice tone="warning" title="Exchange rates are out of date">
          {staleRates
            .map(
              (rate) =>
                `${rate.currency}${rate.updatedAt ? ` (${formatDate(rate.updatedAt)})` : ''}`,
            )
            .join(', ')}
          : values converted from{' '}
          {staleRates.length === 1 ? 'that currency use' : 'those currencies use'} the last stored
          rate.
        </StateNotice>
      ) : null}
      {view.unclassified.holdingCount > 0 ? (
        <StateNotice
          tone="info"
          title={`${view.unclassified.holdingCount} ${view.unclassified.holdingCount === 1 ? 'holding is' : 'holdings are'} unclassified`}
          testId="exposure-unclassified"
          action={{ label: 'Classify holdings', onClick: onClassify }}
        >
          {format.percent(view.unclassified.share)} of your brokerage is in holdings with no asset
          class. They count in the total and in the sector and currency breakdowns, but not in the
          groups. Their risk counts only if the holding has a risk class of its own.
        </StateNotice>
      ) : null}
    </div>
  );
}

const EXCLUDED_KIND = { holding: 'holding', savings: 'account', property: 'property' } as const;

/**
 * The same plain warnings for the Overview: what is in no figure, what rests on an old
 * price or rate, and holdings with no group. Classifying happens on the Brokerage view.
 */
export function HouseholdDataNotices({
  report,
  onClassify,
}: Readonly<{ report: ExposureReport; onClassify: () => void }>) {
  const { view, household } = report;
  const staleHoldings = view.holdings.filter((row) => row.priceStale).map((row) => row.name);
  const single = household.excluded.length === 1;
  return (
    <div className="space-y-2" data-testid="exposure-household-data-state">
      {household.excluded.length > 0 ? (
        <StateNotice
          tone="warning"
          title={`${household.excluded.length} ${single ? 'item is' : 'items are'} left out of the figures`}
          testId="exposure-household-excluded"
        >
          <ul className="list-disc pl-4">
            {household.excluded.map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                {row.name} ({EXCLUDED_KIND[row.kind]}, {row.currency}) {EXCLUDED_REASON[row.reason]}
                . It is not valued at a guess, so it is in no total or share.
              </li>
            ))}
          </ul>
        </StateNotice>
      ) : null}
      {staleHoldings.length > 0 ? (
        <StateNotice tone="warning" title="Some prices have not synced for over a week">
          {listNames(staleHoldings)}: values use the last synced price.
        </StateNotice>
      ) : null}
      {household.staleRates.length > 0 ? (
        <StateNotice tone="warning" title="Exchange rates are out of date">
          {household.staleRates.map((rate) => rate.currency).join(', ')}: values converted from{' '}
          {household.staleRates.length === 1 ? 'that currency use' : 'those currencies use'} the
          last stored rate.
        </StateNotice>
      ) : null}
      {view.unclassified.holdingCount > 0 ? (
        <StateNotice
          tone="info"
          title={`${view.unclassified.holdingCount} ${view.unclassified.holdingCount === 1 ? 'holding is' : 'holdings are'} unclassified`}
          testId="exposure-household-unclassified"
          action={{ label: 'Classify on Brokerage', onClick: onClassify }}
        >
          They count in the total and by currency, but not in a group.
        </StateNotice>
      ) : null}
    </div>
  );
}
