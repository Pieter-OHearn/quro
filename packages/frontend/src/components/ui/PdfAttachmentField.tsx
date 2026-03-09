import { useId, useRef, type ChangeEvent } from 'react';
import type { PdfDocument } from '@quro/shared';
import { FormField } from './FormField';
import { formatPdfFileSize } from '@/lib/pdfDocuments';

type PdfAttachmentFieldProps = {
  label: string;
  document: PdfDocument | null;
  selectedFile: File | null;
  fileError?: string;
  busy?: boolean;
  downloadUrl?: string | null;
  helperText?: string;
  selectedFileHint?: string;
  selectedActionLabel?: string;
  onFileSelect: (file: File | null) => void;
  onClearFile: () => void;
  onRemoveDocument?: () => Promise<void> | void;
  onSelectedAction?: () => void;
};

const actionClass =
  'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

type ActionButtonProps = {
  busy?: boolean;
  className: string;
  label: string;
  onClick: () => void;
};

type EmptyPdfStateProps = {
  busy?: boolean;
  helperText: string;
  onChoosePdf: () => void;
};

type SelectedPdfStateProps = {
  busy?: boolean;
  selectedFile: File;
  selectedHint: string;
  selectedActionLabel?: string;
  onChoosePdf: () => void;
  onClearFile: () => void;
  onSelectedAction?: () => void;
};

type AttachedPdfStateProps = {
  busy?: boolean;
  document: PdfDocument;
  downloadUrl?: string | null;
  onChoosePdf: () => void;
  onRemoveDocument?: () => Promise<void> | void;
};

function ActionButton({ busy, className, label, onClick }: Readonly<ActionButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`${actionClass} ${className}`}
    >
      {label}
    </button>
  );
}

function EmptyPdfState({ busy, helperText, onChoosePdf }: Readonly<EmptyPdfStateProps>) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3">
      <div className="text-xs text-slate-500">{helperText}</div>
      <button
        type="button"
        onClick={onChoosePdf}
        disabled={busy}
        className="rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-200 disabled:opacity-60"
      >
        Choose PDF
      </button>
    </div>
  );
}

function SelectedPdfState({
  busy,
  selectedFile,
  selectedHint,
  selectedActionLabel,
  onChoosePdf,
  onClearFile,
  onSelectedAction,
}: Readonly<SelectedPdfStateProps>) {
  return (
    <div className="rounded-lg border border-indigo-100 bg-white px-2.5 py-2 text-xs text-slate-600">
      <p className="font-medium text-slate-700">Selected: {selectedFile.name}</p>
      <p>{formatPdfFileSize(selectedFile.size)}</p>
      <p className="mt-1 text-[11px] text-slate-500">{selectedHint}</p>
      <div className="mt-2 flex items-center gap-2">
        {onSelectedAction && selectedActionLabel && (
          <ActionButton
            busy={busy}
            onClick={onSelectedAction}
            label={selectedActionLabel}
            className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
          />
        )}
        <ActionButton
          busy={busy}
          onClick={onChoosePdf}
          label="Choose Different PDF"
          className="text-slate-600 hover:bg-slate-100"
        />
        <ActionButton
          busy={busy}
          onClick={onClearFile}
          label="Clear Selection"
          className="text-rose-600 hover:bg-rose-50"
        />
      </div>
    </div>
  );
}

function AttachedPdfState({
  busy,
  document,
  downloadUrl,
  onChoosePdf,
  onRemoveDocument,
}: Readonly<AttachedPdfStateProps>) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600">
      <p className="font-medium text-slate-700">Attached: {document.fileName}</p>
      <p>{formatPdfFileSize(document.sizeBytes)}</p>
      <div className="mt-2 flex items-center gap-2">
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className={`${actionClass} text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700`}
          >
            View PDF
          </a>
        )}
        <ActionButton
          busy={busy}
          onClick={onChoosePdf}
          label="Replace PDF"
          className="text-slate-600 hover:bg-slate-100"
        />
        {onRemoveDocument && (
          <ActionButton
            busy={busy}
            onClick={() => void onRemoveDocument()}
            label="Remove PDF"
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          />
        )}
      </div>
    </div>
  );
}

export function PdfAttachmentField({
  label,
  document,
  selectedFile,
  fileError,
  busy,
  downloadUrl,
  helperText = 'Attach one PDF up to 20MB.',
  selectedFileHint,
  selectedActionLabel,
  onFileSelect,
  onClearFile,
  onRemoveDocument,
  onSelectedAction,
}: Readonly<PdfAttachmentFieldProps>) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = (): void => {
    inputRef.current?.click();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onFileSelect(event.target.files?.[0] ?? null);
    event.target.value = '';
  };

  const selectedHint =
    selectedFileHint ??
    (document
      ? 'This PDF will replace the current one when saved.'
      : 'PDF will be attached when saved.');

  return (
    <FormField label={label} error={fileError}>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleChange}
          disabled={busy}
          className="hidden"
        />
        {!document && !selectedFile && (
          <EmptyPdfState busy={busy} helperText={helperText} onChoosePdf={openPicker} />
        )}
        {selectedFile && (
          <SelectedPdfState
            busy={busy}
            selectedFile={selectedFile}
            selectedHint={selectedHint}
            selectedActionLabel={selectedActionLabel}
            onChoosePdf={openPicker}
            onClearFile={onClearFile}
            onSelectedAction={onSelectedAction}
          />
        )}
        {document && !selectedFile && (
          <AttachedPdfState
            busy={busy}
            document={document}
            downloadUrl={downloadUrl}
            onChoosePdf={openPicker}
            onRemoveDocument={onRemoveDocument}
          />
        )}
      </div>
    </FormField>
  );
}
