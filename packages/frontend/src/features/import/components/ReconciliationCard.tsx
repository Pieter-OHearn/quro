import type { CsvReconciliation } from '@quro/shared';
import { Button, Change } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';

type Props = {
  reconciliation: CsvReconciliation & { adjustmentApplied?: boolean };
  currency: string;
  /** Present once the import has finished: books the difference as one labelled adjustment. */
  onAdjust?: (difference: number) => void;
  adjusting?: boolean;
  /** Whether the figures are what the ledger will show after the import, not what it shows now. */
  predicted?: boolean;
};

/** The statement's closing balance against the ledger on the same date, and the difference. */
export function ReconciliationCard({
  reconciliation,
  currency,
  onAdjust,
  adjusting = false,
  predicted = false,
}: Readonly<Props>) {
  const { fmtNative } = useCurrency();
  const { closing, ledgerBalance, difference, adjustmentApplied } = reconciliation;
  const matches = difference === 0;
  const source =
    closing.origin === 'column' ? `row ${closing.rowNumber} of the file` : 'the figure you entered';

  return (
    <section
      aria-label="Balance check"
      className="space-y-2 rounded-lg border border-border-default px-3 py-2"
    >
      <h3 className="text-title-section text-fg">Balance check</h3>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-cell">
        <dt className="text-fg-muted">
          Statement balance on {closing.date} ({source})
        </dt>
        <dd className="text-right font-numeric text-fg">
          {fmtNative(closing.amount, currency, true)}
        </dd>
        <dt className="text-fg-muted">
          Your ledger on that date{predicted ? ', once these rows are in' : ''}
        </dt>
        <dd className="text-right font-numeric text-fg">
          {fmtNative(ledgerBalance, currency, true)}
        </dd>
        <dt className="font-medium text-fg">Difference</dt>
        <dd className="text-right">
          <Change value={difference} format="amount" currency={currency} showArrow={false} />
        </dd>
      </dl>
      {matches ? (
        <p className="text-caption text-fg-subtle">The ledger agrees with the statement.</p>
      ) : (
        <p className="text-caption text-fg-subtle">
          A difference means a row is missing, repeated or wrong, or the account balance started
          from a different figure. Check the rows first.
        </p>
      )}
      {onAdjust && !matches && !adjustmentApplied ? (
        <Button
          variant="secondary"
          size="sm"
          loading={adjusting}
          loadingLabel="Booking adjustment"
          onClick={() => onAdjust(difference)}
        >
          Book the difference as an adjustment
        </Button>
      ) : null}
      {adjustmentApplied ? (
        <p className="text-caption text-fg-subtle">An adjustment was booked for this import.</p>
      ) : null}
    </section>
  );
}
