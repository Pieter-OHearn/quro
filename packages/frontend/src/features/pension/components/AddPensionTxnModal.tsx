import { useEffect, useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { FormField, CurrencyInput } from '@/components/ui/FormField';
import { TxnTypeSelector } from '@/components/ui/TxnTypeSelector';
import { DateNoteRow } from '@/components/ui/DateNoteRow';
import { api } from '@/lib/api';
import type { PensionPot, PensionStatementDocument, PensionTransaction } from '@quro/shared';
import { PENSION_TXN_META } from '../constants';
import {
  useAddPensionTxnForm,
  useDeletePensionStatementDocument,
  useUploadPensionStatementDocument,
} from '../hooks';
import type {
  AnnualStatementDirection,
  PensionTxnType,
  SavePensionTransactionInput,
  SavePensionTransactionResult,
} from '../types';

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;

const TXN_TYPE_OPTIONS = Object.entries(PENSION_TXN_META).map(([key, meta]) => ({
  key,
  ...meta,
}));

type AddPensionTxnModalProps = {
  pot: PensionPot;
  existing?: PensionTransaction;
  existingDocument: PensionStatementDocument | null;
  onClose: () => void;
  onSave: (txn: SavePensionTransactionInput) => Promise<SavePensionTransactionResult>;
};

type StatementDocumentState = {
  statementDocument: PensionStatementDocument | null;
  selectedFile: File | null;
  fileError: string;
  busy: boolean;
  handleFileSelect: (file: File | null) => void;
  clearSelectedFile: () => void;
  handleRemoveDocument: () => Promise<void>;
  uploadSelectedFile: (transactionId: number) => Promise<void>;
};

function formatFileSize(bytes: number): string {
  if (bytes < KILOBYTE) return `${bytes} B`;
  if (bytes < MEGABYTE) return `${(bytes / KILOBYTE).toFixed(1)} KB`;
  return `${(bytes / MEGABYTE).toFixed(1)} MB`;
}

function validatePdfFile(file: File): string {
  const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
  const allowedMimeType = file.type === 'application/pdf' || file.type === '';

  if (!hasPdfExtension || !allowedMimeType) return 'Only PDF files are allowed';
  if (file.size > MAX_PDF_SIZE_BYTES) return 'PDF exceeds 20MB limit';
  return '';
}

function buildDocumentDownloadUrl(transactionId: number): string {
  return `${api.defaults.baseURL}/api/pensions/transactions/${transactionId}/document/download`;
}

function readApiError(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const responseError = (error as { response?: { data?: { error?: unknown } } }).response?.data
    ?.error;
  return typeof responseError === 'string' ? responseError : null;
}

function resolveErrorMessage(error: unknown): string {
  const apiError = readApiError(error);
  if (apiError) return apiError;
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Failed to save transaction';
}

class StatementDocumentUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatementDocumentUploadError';
  }
}

function createStatementFileSelectHandler(params: {
  statementDocument: PensionStatementDocument | null;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  setFileError: (message: string) => void;
}): (file: File | null) => void {
  return (file: File | null): void => {
    if (!file) {
      params.setSelectedFile(null);
      return;
    }
    if (params.statementDocument) {
      params.setSelectedFile(null);
      params.setFileError('Remove the existing PDF before selecting a new file');
      return;
    }
    if (params.selectedFile) {
      params.setFileError('Clear the selected PDF before choosing another file');
      return;
    }
    const validationError = validatePdfFile(file);
    if (validationError) {
      params.setSelectedFile(null);
      params.setFileError(validationError);
      return;
    }
    params.setFileError('');
    params.setSelectedFile(file);
  };
}

function EmployerToggle({
  isEmployer,
  setIsEmployer,
}: Readonly<{ isEmployer: boolean; setIsEmployer: (value: boolean) => void }>) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setIsEmployer(true)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${isEmployer ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Employer
      </button>
      <button
        type="button"
        onClick={() => setIsEmployer(false)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${!isEmployer ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Employee
      </button>
    </div>
  );
}

function AnnualStatementDirectionToggle({
  direction,
  onChange,
}: Readonly<{
  direction: AnnualStatementDirection;
  onChange: (value: AnnualStatementDirection) => void;
}>) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange('gain')}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${direction === 'gain' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Gain
      </button>
      <button
        type="button"
        onClick={() => onChange('loss')}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${direction === 'loss' ? 'bg-rose-50 border-rose-300 text-rose-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Loss
      </button>
    </div>
  );
}

function PdfAttachmentField({
  document,
  selectedFile,
  fileError,
  busy,
  onFileSelect,
  onClearFile,
  onRemoveDocument,
}: Readonly<{
  document: PensionStatementDocument | null;
  selectedFile: File | null;
  fileError: string;
  busy: boolean;
  onFileSelect: (file: File | null) => void;
  onClearFile: () => void;
  onRemoveDocument: () => Promise<void>;
}>) {
  const downloadUrl = document ? buildDocumentDownloadUrl(document.transactionId) : null;
  const attachmentActionClass =
    'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <FormField label="Annual Statement PDF" error={fileError}>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
        {!document && !selectedFile && (
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
            disabled={busy}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-200"
          />
        )}

        {selectedFile && (
          <div className="rounded-lg border border-indigo-100 bg-white px-2.5 py-2 text-xs text-slate-600">
            <p className="font-medium text-slate-700">Selected: {selectedFile.name}</p>
            <p>{formatFileSize(selectedFile.size)}</p>
            <button
              type="button"
              onClick={onClearFile}
              className="mt-1 text-indigo-600 hover:text-indigo-700"
              disabled={busy}
            >
              Clear selection
            </button>
          </div>
        )}

        {document && !selectedFile && (
          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600">
            <p className="font-medium text-slate-700">Attached: {document.fileName}</p>
            <p>{formatFileSize(document.sizeBytes)}</p>
            <div className="mt-1 flex items-center gap-2">
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${attachmentActionClass} text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700`}
                >
                  View PDF
                </a>
              )}
              <button
                type="button"
                onClick={() => void onRemoveDocument()}
                className={`${attachmentActionClass} text-rose-600 hover:bg-rose-50 hover:text-rose-700`}
                disabled={busy}
              >
                Remove PDF
              </button>
            </div>
          </div>
        )}

        {!document && !selectedFile && (
          <p className="text-[11px] text-slate-500">Attach one PDF up to 20MB.</p>
        )}
      </div>
    </FormField>
  );
}

function ContributionFields({
  currency,
  taxAmount,
  setTaxAmount,
  setError,
}: Readonly<{
  currency: string;
  taxAmount: string;
  setTaxAmount: (value: string) => void;
  setError: (value: string) => void;
}>) {
  return (
    <FormField label={`Tax Amount (${currency})`}>
      <CurrencyInput
        currency={currency}
        value={taxAmount}
        onChange={(value) => {
          setTaxAmount(value);
          setError('');
        }}
      />
    </FormField>
  );
}

function AnnualStatementFields({
  direction,
  setDirection,
  statementDocument,
  selectedFile,
  fileError,
  busy,
  onFileSelect,
  onClearFile,
  onRemoveDocument,
}: Readonly<{
  direction: AnnualStatementDirection;
  setDirection: (value: AnnualStatementDirection) => void;
  statementDocument: PensionStatementDocument | null;
  selectedFile: File | null;
  fileError: string;
  busy: boolean;
  onFileSelect: (file: File | null) => void;
  onClearFile: () => void;
  onRemoveDocument: () => Promise<void>;
}>) {
  return (
    <>
      <FormField label="Statement Result">
        <AnnualStatementDirectionToggle direction={direction} onChange={setDirection} />
      </FormField>
      <PdfAttachmentField
        document={statementDocument}
        selectedFile={selectedFile}
        fileError={fileError}
        busy={busy}
        onFileSelect={onFileSelect}
        onClearFile={onClearFile}
        onRemoveDocument={onRemoveDocument}
      />
    </>
  );
}

function resolveAmountLabel(params: {
  type: PensionTxnType;
  currency: string;
  annualStatementDirection: AnnualStatementDirection;
}): string {
  if (params.type === 'contribution') return `Contribution Amount (${params.currency})`;
  if (params.type === 'fee') return `Fee Amount (${params.currency})`;
  return params.annualStatementDirection === 'gain'
    ? `Investment Gain (${params.currency})`
    : `Investment Loss (${params.currency})`;
}

function PensionTxnDateNoteFields({
  form,
}: Readonly<{ form: ReturnType<typeof useAddPensionTxnForm> }>) {
  return (
    <DateNoteRow
      date={form.date}
      note={form.note}
      onDateChange={form.setDate}
      onNoteChange={form.setNote}
      notePlaceholder="e.g. Monthly SG..."
    />
  );
}

function PensionTxnFormBody({
  form,
  pot,
  documentState,
  busy,
}: Readonly<{
  form: ReturnType<typeof useAddPensionTxnForm>;
  pot: PensionPot;
  documentState: StatementDocumentState;
  busy: boolean;
}>) {
  const amountLabel = resolveAmountLabel({
    type: form.type,
    currency: pot.currency,
    annualStatementDirection: form.annualStatementDirection,
  });

  return (
    <>
      <FormField label="Transaction Type">
        <TxnTypeSelector<PensionTxnType>
          types={TXN_TYPE_OPTIONS}
          value={form.type}
          onChange={form.handleTypeChange}
          columns={3}
        />
      </FormField>
      {form.type === 'contribution' && (
        <EmployerToggle isEmployer={form.isEmployer} setIsEmployer={form.setIsEmployer} />
      )}
      {form.type === 'annual_statement' && (
        <AnnualStatementFields
          direction={form.annualStatementDirection}
          setDirection={form.setAnnualStatementDirection}
          statementDocument={documentState.statementDocument}
          selectedFile={documentState.selectedFile}
          fileError={documentState.fileError}
          busy={busy}
          onFileSelect={documentState.handleFileSelect}
          onClearFile={documentState.clearSelectedFile}
          onRemoveDocument={documentState.handleRemoveDocument}
        />
      )}
      <FormField label={amountLabel} error={form.error}>
        <CurrencyInput
          currency={pot.currency}
          value={form.amount}
          onChange={(value) => {
            form.setAmount(value);
            form.setError('');
          }}
          error={Boolean(form.error)}
        />
      </FormField>
      {form.type === 'contribution' && (
        <ContributionFields
          currency={pot.currency}
          taxAmount={form.taxAmount}
          setTaxAmount={form.setTaxAmount}
          setError={form.setError}
        />
      )}
      <PensionTxnDateNoteFields form={form} />
      {form.parsedAmount > 0 && (
        <PreviewBanner
          type={form.type}
          isEmployer={form.isEmployer}
          amount={form.parsedAmount}
          taxAmount={form.parsedTaxAmount}
          annualStatementDirection={form.annualStatementDirection}
          currency={pot.currency}
          fmtNative={form.fmtNative}
        />
      )}
    </>
  );
}

function resolvePreviewSignedAmount(params: {
  type: PensionTxnType;
  amount: number;
  taxAmount: number;
  annualStatementDirection: AnnualStatementDirection;
}): number {
  if (params.type === 'contribution') return params.amount - params.taxAmount;
  if (params.type === 'fee') return -params.amount;
  return params.annualStatementDirection === 'gain' ? params.amount : -params.amount;
}

function resolvePreviewLabel(params: {
  type: PensionTxnType;
  isEmployer: boolean;
  annualStatementDirection: AnnualStatementDirection;
}): string {
  if (params.type === 'fee') return 'Fee deducted';
  if (params.type === 'annual_statement') {
    return params.annualStatementDirection === 'gain'
      ? 'Annual statement gain'
      : 'Annual statement loss';
  }
  return params.isEmployer ? 'Employer contribution' : 'Employee contribution';
}

function resolvePreviewTone(isDeduction: boolean): { colorClass: string; bgClass: string } {
  return isDeduction
    ? { colorClass: 'text-rose-600', bgClass: 'bg-rose-50 border-rose-100' }
    : { colorClass: 'text-emerald-700', bgClass: 'bg-emerald-50 border-emerald-100' };
}

function PreviewBanner({
  type,
  isEmployer,
  amount,
  taxAmount,
  annualStatementDirection,
  currency,
  fmtNative,
}: Readonly<{
  type: PensionTxnType;
  isEmployer: boolean;
  amount: number;
  taxAmount: number;
  annualStatementDirection: AnnualStatementDirection;
  currency: string;
  fmtNative: (amount: number, currency: string, compact?: boolean) => string;
}>): JSX.Element {
  const signedAmount = resolvePreviewSignedAmount({
    type,
    amount,
    taxAmount,
    annualStatementDirection,
  });
  const isDeduction = signedAmount < 0;
  const { colorClass, bgClass } = resolvePreviewTone(isDeduction);
  const label = resolvePreviewLabel({ type, isEmployer, annualStatementDirection });

  return (
    <div className={`rounded-xl p-4 border ${bgClass}`}>
      <div className="flex justify-between text-xs">
        <span className={`font-medium ${colorClass}`}>{label}</span>
        <span className={`font-bold ${colorClass}`}>
          {isDeduction ? '\u2212' : '+'}
          {fmtNative(Math.abs(signedAmount), currency, true)}
        </span>
      </div>
      {type === 'contribution' && taxAmount > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          Gross {fmtNative(amount, currency, true)} · Tax {fmtNative(taxAmount, currency, true)}
        </p>
      )}
    </div>
  );
}

function useStatementDocumentState(
  initialDocument: PensionStatementDocument | null,
  transactionType: PensionTxnType,
): StatementDocumentState {
  const uploadDocument = useUploadPensionStatementDocument();
  const deleteDocument = useDeletePensionStatementDocument();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [statementDocument, setStatementDocument] = useState<PensionStatementDocument | null>(
    initialDocument,
  );
  const busy = uploadDocument.isPending || deleteDocument.isPending;
  useEffect(() => setStatementDocument(initialDocument), [initialDocument]);
  useEffect(() => {
    if (transactionType !== 'annual_statement') {
      setSelectedFile(null);
      setFileError('');
    }
  }, [transactionType]);
  const handleFileSelect = createStatementFileSelectHandler({
    statementDocument,
    selectedFile,
    setSelectedFile,
    setFileError,
  });
  const handleRemoveDocument = async (): Promise<void> => {
    if (!statementDocument) return;
    try {
      await deleteDocument.mutateAsync(statementDocument.transactionId);
      setStatementDocument(null);
      setFileError('');
    } catch (error) {
      setFileError(resolveErrorMessage(error));
    }
  };
  const uploadSelectedFile = async (transactionId: number): Promise<void> => {
    if (!selectedFile) return;
    const validationError = validatePdfFile(selectedFile);
    if (validationError) {
      setFileError(validationError);
      throw new StatementDocumentUploadError(validationError);
    }
    try {
      const uploaded = await uploadDocument.mutateAsync({ transactionId, file: selectedFile });
      setStatementDocument(uploaded);
      setSelectedFile(null);
      setFileError('');
    } catch (error) {
      const message = resolveErrorMessage(error);
      setFileError(message);
      throw new StatementDocumentUploadError(message);
    }
  };
  return {
    statementDocument,
    selectedFile,
    fileError,
    busy,
    handleFileSelect,
    clearSelectedFile: () => {
      setSelectedFile(null);
      setFileError('');
    },
    handleRemoveDocument,
    uploadSelectedFile,
  };
}

export function AddPensionTxnModal({
  pot,
  existing,
  existingDocument,
  onClose,
  onSave,
}: AddPensionTxnModalProps): JSX.Element {
  const form = useAddPensionTxnForm(pot, existing);
  const documentState = useStatementDocumentState(existingDocument, form.type);
  const [isSaving, setIsSaving] = useState(false);
  const [savedTransactionId, setSavedTransactionId] = useState<number | null>(existing?.id ?? null);
  const busy = isSaving || documentState.busy;

  const handleConfirm = async (): Promise<void> => {
    const payload = form.handleSave();
    if (!payload) return;

    setIsSaving(true);
    try {
      const payloadWithStableId =
        payload.id || savedTransactionId === null
          ? payload
          : { ...payload, id: savedTransactionId };
      const savedTransaction = await onSave(payloadWithStableId);
      setSavedTransactionId(savedTransaction.id);
      if (form.type === 'annual_statement') {
        await documentState.uploadSelectedFile(savedTransaction.id);
      }
      onClose();
    } catch (error) {
      if (error instanceof StatementDocumentUploadError) return;
      form.setError(resolveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const isEditing = Boolean(existing);

  return (
    <Modal
      title={isEditing ? 'Edit Transaction' : 'Record Transaction'}
      subtitle={`${pot.emoji} ${pot.name}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => void handleConfirm()}
          confirmLabel={isEditing ? 'Save Changes' : 'Record'}
          loading={busy}
          disabled={busy}
        />
      }
    >
      <PensionTxnFormBody form={form} pot={pot} documentState={documentState} busy={busy} />
    </Modal>
  );
}
