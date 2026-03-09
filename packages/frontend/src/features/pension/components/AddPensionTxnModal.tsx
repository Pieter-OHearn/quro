import { useEffect, useEffectEvent, useState } from 'react';
import {
  CurrencyInput,
  FormField,
  Modal,
  ModalFooter,
  PdfAttachmentField,
  TxnTypeSelector,
  DateNoteRow,
} from '@/components/ui';
import type { PensionPot, PensionStatementDocument, PensionTransaction } from '@quro/shared';
import {
  PdfAttachmentUploadError,
  buildApiDownloadUrl,
  resolveApiErrorMessage,
  usePdfAttachmentState,
} from '@/lib/pdfDocuments';
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

function resolveErrorMessage(error: unknown): string {
  return resolveApiErrorMessage(error, 'Failed to save transaction');
}

type StatementDocumentState = {
  document: PensionStatementDocument | null;
  selectedFile: File | null;
  fileError: string;
  busy: boolean;
  setFileError: (value: string) => void;
  handleFileSelect: (file: File | null) => void;
  clearSelectedFile: () => void;
  handleRemoveDocument: (ownerId: number) => Promise<void>;
  uploadSelectedFile: (ownerId: number) => Promise<void>;
};

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
  document,
  selectedFile,
  fileError,
  busy,
  onFileSelect,
  onClearFile,
  onRemoveDocument,
}: Readonly<{
  direction: AnnualStatementDirection;
  setDirection: (value: AnnualStatementDirection) => void;
  document: PensionStatementDocument | null;
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
        label="Annual Statement PDF"
        document={document}
        selectedFile={selectedFile}
        fileError={fileError}
        busy={busy}
        downloadUrl={
          document
            ? buildApiDownloadUrl(
                `/api/pensions/transactions/${document.transactionId}/document/download`,
              )
            : null
        }
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
          document={documentState.document}
          selectedFile={documentState.selectedFile}
          fileError={documentState.fileError}
          busy={busy}
          onFileSelect={documentState.handleFileSelect}
          onClearFile={documentState.clearSelectedFile}
          onRemoveDocument={() =>
            documentState.document
              ? documentState.handleRemoveDocument(documentState.document.transactionId)
              : Promise.resolve()
          }
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
  const documentState = usePdfAttachmentState({
    initialDocument,
    uploadFile: (transactionId, file) => uploadDocument.mutateAsync({ transactionId, file }),
    deleteFile: (transactionId) => deleteDocument.mutateAsync(transactionId),
    isUploading: uploadDocument.isPending,
    isDeleting: deleteDocument.isPending,
    uploadErrorMessage: 'Failed to upload annual statement PDF',
    deleteErrorMessage: 'Failed to remove annual statement PDF',
  });

  const clearSelectedFile = useEffectEvent(() => {
    documentState.clearSelectedFile();
  });

  useEffect(() => {
    if (transactionType !== 'annual_statement') {
      clearSelectedFile();
    }
  }, [transactionType]);

  return documentState;
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
      if (error instanceof PdfAttachmentUploadError) return;
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
