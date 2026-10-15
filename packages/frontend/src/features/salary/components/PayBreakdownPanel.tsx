import { formatPercent, type Payslip } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { Card, Change, PanelHeader, PdfAttachmentField } from '@/components/ui';
import { buildApiDownloadUrl, usePdfAttachmentState } from '@/lib/pdfDocuments';
import { useDeletePayslipDocument, useUploadPayslipDocument } from '../hooks';
import { buildBreakdownItems, getPayslipBreakdownTotal } from '../utils/salary-data';

type PayBreakdownPanelProps = {
  selected: Payslip | null;
};

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

function PayBreakdownDetail({ selected }: Readonly<{ selected: Payslip }>) {
  const { numberFormat, convertToBase, baseCurrency } = useCurrency();
  const totalPay = getPayslipBreakdownTotal(selected);
  const percentageOfTotal = (value: number): number =>
    totalPay > 0 ? (value / totalPay) * 100 : 0;
  const taxValue = Math.abs(selected.tax);
  const pensionValue = Math.abs(selected.pension);

  return (
    <>
      {/* Take-home pay, tax and pension as shares of the total, in their chart colours. */}
      <div
        className="mb-4 flex h-2 gap-px overflow-hidden rounded-full bg-surface-muted"
        aria-hidden
      >
        <div
          className="h-full bg-viz-1"
          style={{ width: `${percentageOfTotal(Math.abs(selected.net))}%` }}
        />
        <div className="h-full bg-viz-6" style={{ width: `${percentageOfTotal(taxValue)}%` }} />
        <div className="h-full bg-viz-3" style={{ width: `${percentageOfTotal(pensionValue)}%` }} />
      </div>
      <div className="space-y-1.5">
        {buildBreakdownItems(selected).map(({ label, val, color, pct }) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
              <span className="text-cell text-fg-muted">{label}</span>
            </div>
            <div className="flex items-baseline gap-3">
              {pct !== undefined && (
                <span className="text-caption text-fg-subtle font-numeric">
                  {formatPercent(pct, numberFormat, 0)}
                </span>
              )}
              <Change
                format="amount"
                currency={baseCurrency}
                value={convertToBase(val, selected.currency)}
                showArrow={false}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-border-subtle pt-3">
        <PayslipDocumentSection key={selected.id} payslip={selected} />
      </div>
    </>
  );
}

export function PayBreakdownPanel({ selected }: Readonly<PayBreakdownPanelProps>) {
  return (
    <Card padding="none">
      <PanelHeader
        title="Pay breakdown"
        subtitle={`${selected?.month ?? '—'} — click a payslip row to switch month`}
      />
      <div className="p-4">
        {selected ? (
          <PayBreakdownDetail selected={selected} />
        ) : (
          <p className="py-8 text-center text-cell text-fg-subtle">No payslips yet.</p>
        )}
      </div>
    </Card>
  );
}
