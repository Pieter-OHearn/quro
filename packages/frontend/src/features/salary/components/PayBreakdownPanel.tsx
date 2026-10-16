import { useId, useMemo, useState } from 'react';
import {
  CURRENCY_META,
  formatPercent,
  type NumberFormatPreference,
  type Payslip,
} from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { Card, Change, PanelHeader, PdfAttachmentField, SelectInput } from '@/components/ui';
import { buildApiDownloadUrl, usePdfAttachmentState } from '@/lib/pdfDocuments';
import { useDeletePayslipDocument, useUploadPayslipDocument } from '../hooks';
import {
  buildBreakdownLines,
  findPreviousPayslip,
  getPayslipBreakdownTotal,
  type BreakdownLine,
} from '../utils/salary-data';

type PayBreakdownPanelProps = {
  selected: Payslip | null;
  /** Every payslip, across years, so any month can be compared with the selected one. */
  payslips: readonly Payslip[];
};

type CompareChoice = 'previous' | 'none' | `${number}`;

// A household with years of payslips would otherwise get a very long list; the newest are enough.
const COMPARE_OPTION_LIMIT = 60;

function PayslipDocumentSection({ payslip }: Readonly<{ payslip: Payslip }>) {
  const uploadDocument = useUploadPayslipDocument();
  const deleteDocument = useDeletePayslipDocument();
  const documentState = usePdfAttachmentState({
    initialDocument: payslip.document,
    uploadFile: (payslipId, file) => uploadDocument.mutateAsync({ payslipId, file }),
    deleteFile: (payslipId) => deleteDocument.mutateAsync(payslipId),
    isUploading: uploadDocument.isPending,
    isDeleting: deleteDocument.isPending,
    uploadErrorMessage: 'Failed to upload payslip PDF',
    deleteErrorMessage: 'Failed to remove payslip PDF',
  });

  return (
    <PdfAttachmentField
      label="Payslip PDF"
      document={documentState.document}
      selectedFile={documentState.selectedFile}
      fileError={documentState.fileError}
      busy={documentState.busy}
      downloadUrl={buildApiDownloadUrl(`/api/salary/payslips/${payslip.id}/document/download`)}
      selectedFileHint={
        documentState.document
          ? 'This PDF will replace the current one when uploaded.'
          : 'Upload a PDF to keep the original payslip with this entry.'
      }
      selectedActionLabel="Upload PDF"
      onFileSelect={documentState.handleFileSelect}
      onClearFile={documentState.clearSelectedFile}
      onRemoveDocument={() => documentState.handleRemoveDocument(payslip.id)}
      onSelectedAction={() => {
        void documentState.uploadSelectedFile(payslip.id).catch(() => {});
      }}
    />
  );
}

function BreakdownBar({ selected }: Readonly<{ selected: Payslip }>) {
  const totalPay = getPayslipBreakdownTotal(selected);
  const percentageOfTotal = (value: number): number =>
    totalPay > 0 ? (value / totalPay) * 100 : 0;

  return (
    // Take-home pay, tax and pension as shares of the total, in their chart colours.
    <div className="mb-4 flex h-2 gap-px overflow-hidden rounded-full bg-surface-muted" aria-hidden>
      <div
        className="h-full bg-viz-1"
        style={{ width: `${percentageOfTotal(Math.abs(selected.net))}%` }}
      />
      <div
        className="h-full bg-viz-6"
        style={{ width: `${percentageOfTotal(Math.abs(selected.tax))}%` }}
      />
      <div
        className="h-full bg-viz-3"
        style={{ width: `${percentageOfTotal(Math.abs(selected.pension))}%` }}
      />
    </div>
  );
}

type PayBreakdownTableProps = {
  selected: Payslip;
  compareTo: Payslip | null;
  lines: readonly BreakdownLine[];
  baseCurrency: string;
  numberFormat: NumberFormatPreference;
  fmtNative: (amount: number, currency: string) => string;
};

/** The gross-to-take-home lines of one payslip, with the change from another one beside them. */
export function PayBreakdownTable({
  selected,
  compareTo,
  lines,
  baseCurrency,
  numberFormat,
  fmtNative,
}: Readonly<PayBreakdownTableProps>) {
  const foreign =
    selected.currency !== baseCurrency ||
    (compareTo !== null && compareTo.currency !== baseCurrency);
  const paidIn = CURRENCY_META[selected.currency];

  return (
    <>
      <table className="w-full text-cell">
        <caption className="sr-only">
          Gross to take-home pay for {selected.month}
          {compareTo ? `, compared with ${compareTo.month}` : ''}, in {baseCurrency}
        </caption>
        <thead>
          <tr className="text-label text-fg-muted">
            <th scope="col" className="py-1 text-left font-medium">
              Line
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {selected.month}
            </th>
            {compareTo ? (
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                vs {compareTo.month}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {lines.map(({ key, label, color, value, change, pct }) => (
            <tr key={key} className="align-baseline">
              <th scope="row" className="py-0.5 text-left font-normal">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />
                  <span className="text-cell text-fg-muted">{label}</span>
                  {pct === undefined ? null : (
                    <span className="text-caption text-fg-subtle font-numeric">
                      {formatPercent(pct, numberFormat, 0)}
                    </span>
                  )}
                </span>
              </th>
              <td className="py-0.5 text-right">
                <Change format="amount" currency={baseCurrency} value={value} showArrow={false} />
              </td>
              {compareTo ? (
                <td className="py-0.5 pl-3 text-right">
                  {change === null ? null : (
                    <Change format="amount" currency={baseCurrency} value={change} />
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-caption text-fg-subtle">
        Take-home pay is gross pay plus any bonus, less income tax and pension. A negative deduction
        is a correction.
      </p>
      {foreign ? (
        <p className="mt-1 text-caption text-fg-subtle">
          <span aria-hidden>{paidIn.flag} </span>
          Paid in {selected.currency}: {fmtNative(selected.gross, selected.currency)} gross,{' '}
          {fmtNative(selected.net, selected.currency)} take-home. Converted to {baseCurrency} at
          today&apos;s rate.
        </p>
      ) : null}
    </>
  );
}

function compareOptionLabel(payslip: Payslip): string {
  return `${payslip.month} (${payslip.currency})`;
}

function buildCompareOptions(
  previous: Payslip | null,
  others: readonly Payslip[],
  picked: Payslip | undefined,
) {
  const listed = others.slice(0, COMPARE_OPTION_LIMIT);
  // A payslip chosen from further back stays in the list while it is the comparison.
  const shown = picked && !listed.includes(picked) ? [...listed, picked] : listed;
  return [
    {
      value: 'previous',
      label: previous ? `Previous payslip (${previous.month})` : 'Previous payslip (none)',
      disabled: previous === null,
    },
    { value: 'none', label: 'No comparison' },
    ...shown.map((payslip) => ({ value: String(payslip.id), label: compareOptionLabel(payslip) })),
  ];
}

function useCompareTarget(selected: Payslip, payslips: readonly Payslip[]) {
  const [choice, setChoice] = useState<CompareChoice>('previous');
  const previous = useMemo(() => findPreviousPayslip(selected, payslips), [selected, payslips]);
  const others = useMemo(
    () =>
      payslips
        .filter((payslip) => payslip.id !== selected.id)
        .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id),
    [payslips, selected.id],
  );
  const picked = others.find((payslip) => String(payslip.id) === choice);
  // A chosen payslip that is gone (deleted, or now the selected one) falls back to the previous.
  const compareTo = choice === 'none' ? null : (picked ?? previous);
  const options = buildCompareOptions(previous, others, picked);
  const shownChoice: CompareChoice =
    picked || choice === 'none' ? choice : previous ? 'previous' : 'none';

  return { choice: shownChoice, setChoice, compareTo, options };
}

function PayBreakdownDetail({
  selected,
  payslips,
}: Readonly<{ selected: Payslip; payslips: readonly Payslip[] }>) {
  const { numberFormat, convertToBase, baseCurrency, fmtNative } = useCurrency();
  const compareId = useId();
  const { choice, setChoice, compareTo, options } = useCompareTarget(selected, payslips);
  const lines = useMemo(
    () => buildBreakdownLines(selected, compareTo, convertToBase),
    [selected, compareTo, convertToBase],
  );

  return (
    <>
      {payslips.length > 1 ? (
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor={compareId} className="shrink-0 text-label text-fg-muted">
            Compare with
          </label>
          <SelectInput
            id={compareId}
            value={choice}
            onChange={(value) => setChoice(value as CompareChoice)}
            options={options}
            className="min-w-0 flex-1"
          />
        </div>
      ) : null}
      <BreakdownBar selected={selected} />
      <PayBreakdownTable
        selected={selected}
        compareTo={compareTo}
        lines={lines}
        baseCurrency={baseCurrency}
        numberFormat={numberFormat}
        fmtNative={fmtNative}
      />
      <div className="mt-4 border-t border-border-subtle pt-3">
        <PayslipDocumentSection key={selected.id} payslip={selected} />
      </div>
    </>
  );
}

export function PayBreakdownPanel({ selected, payslips }: Readonly<PayBreakdownPanelProps>) {
  return (
    <Card padding="none">
      <PanelHeader
        title="Pay breakdown"
        subtitle={`${selected?.month ?? '—'} — click a payslip row to switch month`}
      />
      <div className="p-4">
        {selected ? (
          <PayBreakdownDetail selected={selected} payslips={payslips} />
        ) : (
          <p className="py-8 text-center text-cell text-fg-subtle">No payslips yet.</p>
        )}
      </div>
    </Card>
  );
}
