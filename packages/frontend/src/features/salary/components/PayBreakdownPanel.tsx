import type { Payslip } from '@quro/shared';
import { PdfAttachmentField } from '@/components/ui';
import { buildApiDownloadUrl, usePdfAttachmentState } from '@/lib/pdfDocuments';
import { useDeletePayslipDocument, useUploadPayslipDocument } from '../hooks';
import type { FmtFn } from '../types';
import { buildBreakdownItems, getPayslipBreakdownTotal } from '../utils/salary-data';

type PayBreakdownPanelProps = {
  selected: Payslip | null;
  fmtBase: FmtFn;
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

function PayBreakdownDetail({
  selected,
  fmtBase,
}: Readonly<{ selected: Payslip; fmtBase: FmtFn }>) {
  const totalPay = getPayslipBreakdownTotal(selected);
  const percentageOfTotal = (value: number): number =>
    totalPay > 0 ? (value / totalPay) * 100 : 0;
  const taxValue = Math.abs(selected.tax);
  const pensionValue = Math.abs(selected.pension);

  return (
    <>
      <div className="flex h-7 rounded-xl overflow-hidden mb-5 gap-px">
        <div
          className="bg-emerald-500 h-full"
          style={{ width: `${percentageOfTotal(Math.abs(selected.net))}%` }}
        />
        <div
          className={`${selected.tax < 0 ? 'bg-emerald-300' : 'bg-rose-400'} h-full`}
          style={{ width: `${percentageOfTotal(taxValue)}%` }}
        />
        <div
          className={`${selected.pension < 0 ? 'bg-emerald-300' : 'bg-indigo-400'} h-full`}
          style={{ width: `${percentageOfTotal(pensionValue)}%` }}
        />
      </div>
      <div className="space-y-2.5">
        {buildBreakdownItems(selected).map(({ label, val, color, tc, pct }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-sm ${color}`} />
              <span className="text-sm text-slate-600">{label}</span>
            </div>
            <div className="flex items-center gap-3">
              {pct !== undefined && (
                <span className="text-xs text-slate-400">{pct.toFixed(0)}%</span>
              )}
              <span className={`text-sm font-semibold ${tc}`}>
                {val >= 0 ? '+' : '\u2212'}
                {fmtBase(Math.abs(val), selected.currency)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <PayslipDocumentSection key={selected.id} payslip={selected} />
    </>
  );
}

export function PayBreakdownPanel({ selected, fmtBase }: Readonly<PayBreakdownPanelProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Pay Breakdown</h3>
      <p className="text-xs text-slate-400 mb-4">
        {selected?.month ?? '—'} — click a payslip row to switch month
      </p>
      {selected ? (
        <PayBreakdownDetail selected={selected} fmtBase={fmtBase} />
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">No payslips yet.</p>
      )}
    </div>
  );
}
