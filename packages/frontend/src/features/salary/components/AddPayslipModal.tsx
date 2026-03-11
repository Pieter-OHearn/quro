import { useState } from 'react';
import {
  CURRENCY_CODES,
  CURRENCY_META,
  type CurrencyCode,
  type Payslip,
  type PayslipDocument,
} from '@quro/shared';
import { Info, Trash2 } from 'lucide-react';
import {
  CurrencyInput,
  FormField,
  Modal,
  ModalFooter,
  PdfAttachmentField,
  SelectInput,
  TextInput,
} from '@/components/ui';
import {
  PdfAttachmentUploadError,
  buildApiDownloadUrl,
  resolveApiErrorMessage,
  usePdfAttachmentState,
} from '@/lib/pdfDocuments';
import { useAddPayslipForm, useDeletePayslipDocument, useUploadPayslipDocument } from '../hooks';
import type { PayslipFieldErrorMap, PayslipFormState, SavePayslipInput } from '../types';

type AddPayslipModalProps = {
  existing?: Payslip;
  onClose: () => void;
  onSave: (payslip: SavePayslipInput) => Promise<Payslip>;
  onDelete?: (id: number) => void;
  baseCurrency: CurrencyCode;
};

type NetPreviewProps = {
  net: number;
  tax: number;
  pension: number;
  payCurrency: CurrencyCode;
};

type FormFieldSetter = <K extends keyof PayslipFormState>(
  field: K,
  value: PayslipFormState[K],
) => void;

type PayslipFormPartProps = {
  form: PayslipFormState;
  errors: PayslipFieldErrorMap;
  set: FormFieldSetter;
  disabled?: boolean;
};

type PayslipFormController = ReturnType<typeof useAddPayslipForm>;

type PayslipDocumentState = {
  busy: boolean;
  document: PayslipDocument | null;
  selectedFile: File | null;
  fileError: string;
  clearSelectedFile: () => void;
  handleFileSelect: (file: File | null) => void;
  handleRemoveDocument: (ownerId: number) => Promise<void>;
  uploadSelectedFile: (ownerId: number) => Promise<void>;
};

type PayslipModalBodyProps = {
  form: PayslipFormController;
  busy: boolean;
  formLocked: boolean;
  formError: string;
  isEdit: boolean;
  savedPayslipId: number | null;
  documentOwnerId: number | null;
  documentDownloadUrl: string | null;
  selectedFileHint: string;
  documentState: PayslipDocumentState;
};

function formatCurrency(amount: number, currency: CurrencyCode) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function NetPreview({ net, tax, pension, payCurrency }: Readonly<NetPreviewProps>) {
  const previewTotal = Math.abs(net) + Math.abs(tax) + Math.abs(pension);

  return (
    <div
      className={`rounded-xl p-4 border ${net >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Info size={15} className={net >= 0 ? 'text-emerald-600' : 'text-rose-500'} />
          <p className="text-sm font-semibold text-slate-700">Calculated Take-Home</p>
        </div>
        <p className={`font-bold ${net >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {net >= 0 ? formatCurrency(net, payCurrency) : 'Check values'}
        </p>
      </div>
      {previewTotal > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden gap-px">
          {[
            { id: 'net', pct: (Math.abs(net) / previewTotal) * 100, color: 'bg-emerald-500' },
            {
              id: 'tax',
              pct: (Math.abs(tax) / previewTotal) * 100,
              color: tax < 0 ? 'bg-emerald-300' : 'bg-rose-400',
            },
            {
              id: 'pension',
              pct: (Math.abs(pension) / previewTotal) * 100,
              color: pension < 0 ? 'bg-emerald-300' : 'bg-indigo-400',
            },
          ]
            .filter((segment) => segment.pct > 0)
            .map((segment) => (
              <div
                key={segment.id}
                className={`h-full ${segment.color}`}
                style={{ width: `${segment.pct}%` }}
              />
            ))}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-1.5">Gross, bonus and deduction adjustments</p>
    </div>
  );
}

function PayslipCurrencyField({ form, errors, set, disabled }: Readonly<PayslipFormPartProps>) {
  return (
    <FormField label="Pay Currency" required error={errors.currency}>
      <SelectInput
        value={form.currency}
        onChange={(value) => set('currency', value as CurrencyCode)}
        disabled={disabled}
        options={CURRENCY_CODES.map((currency) => ({
          value: currency,
          label: `${CURRENCY_META[currency].flag} ${currency}`,
        }))}
      />
    </FormField>
  );
}

function PayslipPeriodField({ form, errors, set, disabled }: Readonly<PayslipFormPartProps>) {
  return (
    <FormField label="Pay Period" required error={errors.month}>
      <TextInput
        data-testid="salary-payslip-month-input"
        value={form.month}
        onChange={(value) => set('month', value)}
        placeholder="e.g. Mar 2026"
        error={Boolean(errors.month)}
        disabled={disabled}
      />
    </FormField>
  );
}

function PayslipDateField({ form, errors, set, disabled }: Readonly<PayslipFormPartProps>) {
  return (
    <FormField label="Pay Date" required error={errors.date}>
      <TextInput
        data-testid="salary-payslip-date-input"
        type="date"
        value={form.date}
        onChange={(value) => set('date', value)}
        error={Boolean(errors.date)}
        disabled={disabled}
      />
    </FormField>
  );
}

function PayslipGrossField({ form, errors, set, disabled }: Readonly<PayslipFormPartProps>) {
  return (
    <FormField label={`Gross Pay (${form.currency})`} required error={errors.gross}>
      <CurrencyInput
        data-testid="salary-payslip-gross-input"
        currency={form.currency}
        value={form.gross}
        onChange={(value) => set('gross', value)}
        error={Boolean(errors.gross)}
        disabled={disabled}
      />
    </FormField>
  );
}

function PayslipBonusField({ form, set, disabled }: Readonly<PayslipFormPartProps>) {
  return (
    <FormField label={`Bonus (${form.currency})`} hint="optional">
      <CurrencyInput
        data-testid="salary-payslip-bonus-input"
        currency={form.currency}
        value={form.bonus}
        onChange={(value) => set('bonus', value)}
        disabled={disabled}
      />
    </FormField>
  );
}

function PayslipDeductionsRow({ form, errors, set, disabled }: Readonly<PayslipFormPartProps>) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Deductions</p>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={`Income Tax (${form.currency})`} required error={errors.tax}>
          <CurrencyInput
            data-testid="salary-payslip-tax-input"
            currency={form.currency}
            value={form.tax}
            onChange={(value) => set('tax', value)}
            error={Boolean(errors.tax)}
            disabled={disabled}
          />
        </FormField>
        <FormField label={`Pension (${form.currency})`} required error={errors.pension}>
          <CurrencyInput
            data-testid="salary-payslip-pension-input"
            currency={form.currency}
            value={form.pension}
            onChange={(value) => set('pension', value)}
            error={Boolean(errors.pension)}
            disabled={disabled}
          />
        </FormField>
      </div>
    </div>
  );
}

function PayslipFormFields({
  form,
  busy,
  formLocked,
}: Readonly<{
  form: PayslipFormController;
  busy: boolean;
  formLocked: boolean;
}>) {
  const disabled = busy || formLocked;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PayslipCurrencyField
          form={form.form}
          errors={form.errors}
          set={form.set}
          disabled={disabled}
        />
        <PayslipPeriodField
          form={form.form}
          errors={form.errors}
          set={form.set}
          disabled={disabled}
        />
        <PayslipDateField
          form={form.form}
          errors={form.errors}
          set={form.set}
          disabled={disabled}
        />
        <PayslipGrossField
          form={form.form}
          errors={form.errors}
          set={form.set}
          disabled={disabled}
        />
        <PayslipBonusField
          form={form.form}
          errors={form.errors}
          set={form.set}
          disabled={disabled}
        />
      </div>
      <PayslipDeductionsRow
        form={form.form}
        errors={form.errors}
        set={form.set}
        disabled={disabled}
      />
    </>
  );
}

function buildDeleteButton(
  existing: Payslip | undefined,
  onDelete: ((id: number) => void) | undefined,
  onClose: () => void,
  busy: boolean,
) {
  if (!existing || !onDelete) return undefined;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        onDelete(existing.id);
        onClose();
      }}
      className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2.5 text-sm text-rose-500 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      title="Delete payslip"
    >
      <Trash2 size={14} />
    </button>
  );
}

function usePayslipDocumentState(existing?: Payslip): PayslipDocumentState {
  const uploadDocument = useUploadPayslipDocument();
  const deleteDocument = useDeletePayslipDocument();

  return usePdfAttachmentState({
    initialDocument: existing?.document ?? null,
    uploadFile: (payslipId, file) => uploadDocument.mutateAsync({ payslipId, file }),
    deleteFile: (payslipId) => deleteDocument.mutateAsync(payslipId),
    isUploading: uploadDocument.isPending,
    isDeleting: deleteDocument.isPending,
    uploadErrorMessage: 'Failed to upload payslip PDF',
    deleteErrorMessage: 'Failed to remove payslip PDF',
  });
}

function getDocumentOwnerId(existing: Payslip | undefined, savedPayslipId: number | null) {
  return existing?.id ?? savedPayslipId;
}

function getDocumentDownloadUrl(documentOwnerId: number | null): string | null {
  return documentOwnerId === null
    ? null
    : buildApiDownloadUrl(`/api/salary/payslips/${documentOwnerId}/document/download`);
}

function getSelectedFileHint(documentOwnerId: number | null, isEdit: boolean): string {
  if (documentOwnerId === null) {
    return 'PDF will be attached right after the payslip is saved.';
  }

  return isEdit
    ? 'This PDF will replace the current one when you save changes.'
    : 'This PDF will be uploaded to the saved payslip when you click Finish.';
}

function getConfirmLabel(isEdit: boolean, savedPayslipId: number | null): string {
  if (isEdit) return 'Save Changes';
  return savedPayslipId === null ? 'Save Payslip' : 'Finish';
}

async function resolveSavedPayslipId(params: {
  existing?: Payslip;
  savedPayslipId: number | null;
  onSave: (payslip: SavePayslipInput) => Promise<Payslip>;
  payload: SavePayslipInput;
}): Promise<number> {
  if (!params.existing && params.savedPayslipId !== null) {
    return params.savedPayslipId;
  }

  const savedPayslip = await params.onSave(params.payload);
  return savedPayslip.id;
}

async function submitPayslipChanges(params: {
  existing?: Payslip;
  savedPayslipId: number | null;
  onSave: (payslip: SavePayslipInput) => Promise<Payslip>;
  payload: SavePayslipInput;
  documentState: Pick<PayslipDocumentState, 'selectedFile' | 'uploadSelectedFile'>;
  setSavedPayslipId: (id: number) => void;
}): Promise<void> {
  const savedPayslipId = await resolveSavedPayslipId(params);
  if (!params.existing && params.savedPayslipId === null) {
    params.setSavedPayslipId(savedPayslipId);
  }

  if (params.documentState.selectedFile) {
    await params.documentState.uploadSelectedFile(savedPayslipId);
  }
}

function PayslipModalBody({
  form,
  busy,
  formLocked,
  formError,
  isEdit,
  savedPayslipId,
  documentOwnerId,
  documentDownloadUrl,
  selectedFileHint,
  documentState,
}: Readonly<PayslipModalBodyProps>) {
  return (
    <>
      {!isEdit && savedPayslipId !== null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Payslip saved. Retry the PDF upload or close this modal to finish without an attachment.
        </div>
      )}
      {formError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError}
        </div>
      )}
      <PayslipFormFields form={form} busy={busy} formLocked={formLocked} />
      <PdfAttachmentField
        label="Payslip PDF"
        document={documentState.document}
        selectedFile={documentState.selectedFile}
        fileError={documentState.fileError}
        busy={busy}
        downloadUrl={documentState.document ? documentDownloadUrl : null}
        selectedFileHint={selectedFileHint}
        onFileSelect={documentState.handleFileSelect}
        onClearFile={documentState.clearSelectedFile}
        onRemoveDocument={
          documentOwnerId === null
            ? undefined
            : () => documentState.handleRemoveDocument(documentOwnerId)
        }
      />
      <NetPreview
        net={form.net}
        tax={form.tax}
        pension={form.pension}
        payCurrency={form.form.currency}
      />
    </>
  );
}

export function AddPayslipModal({
  existing,
  onClose,
  onSave,
  onDelete,
  baseCurrency,
}: Readonly<AddPayslipModalProps>) {
  const form = useAddPayslipForm(baseCurrency, existing);
  const documentState = usePayslipDocumentState(existing);
  const [savedPayslipId, setSavedPayslipId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const isEdit = Boolean(existing);
  const busy = isSaving || documentState.busy;
  const formLocked = !isEdit && savedPayslipId !== null;
  const documentOwnerId = getDocumentOwnerId(existing, savedPayslipId);
  const documentDownloadUrl = getDocumentDownloadUrl(documentOwnerId);
  const selectedFileHint = getSelectedFileHint(documentOwnerId, isEdit);
  const confirmLabel = getConfirmLabel(isEdit, savedPayslipId);
  const deleteButton = buildDeleteButton(existing, onDelete, onClose, busy);

  const handleConfirm = async (): Promise<void> => {
    const payload = form.buildPayload();
    if (!payload) return;

    setFormError('');
    setIsSaving(true);
    try {
      await submitPayslipChanges({
        existing,
        savedPayslipId,
        onSave,
        payload: payload as SavePayslipInput,
        documentState,
        setSavedPayslipId,
      });
      onClose();
    } catch (error) {
      if (error instanceof PdfAttachmentUploadError) return;
      setFormError(resolveApiErrorMessage(error, 'Failed to save payslip'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit Payslip' : 'Add Payslip'}
      subtitle={`Amounts in ${form.form.currency} · Base currency ${baseCurrency}`}
      onClose={onClose}
      maxWidth="lg"
      scrollable
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => void handleConfirm()}
          confirmLabel={confirmLabel}
          loading={busy}
          disabled={busy}
          danger={deleteButton}
        />
      }
    >
      <PayslipModalBody
        form={form}
        busy={busy}
        formLocked={formLocked}
        formError={formError}
        isEdit={isEdit}
        savedPayslipId={savedPayslipId}
        documentOwnerId={documentOwnerId}
        documentDownloadUrl={documentDownloadUrl}
        selectedFileHint={selectedFileHint}
        documentState={documentState}
      />
    </Modal>
  );
}
