import { useId, useRef, type ChangeEvent } from 'react';
import type { PdfDocument } from '@quro/shared';
import { formatPdfFileSize } from '@/lib/pdfDocuments';
import { cn } from '@/lib/utils';
import { Button } from '../../atoms';
import { FormField } from '../FormField';

export type PdfAttachmentFieldProps = {
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

// Actions are 32px ghost buttons (44px on phones); "View PDF" is a link styled the same way.
const ACTION_TONE_CLASSES = {
  neutral: '',
  brand: 'text-brand hover:bg-brand-soft hover:text-brand-fg active:bg-brand-soft',
  danger: 'text-danger hover:bg-danger-soft active:bg-danger-soft',
} as const;

const LINK_ACTION_CLASS_NAME = cn(
  'inline-flex h-8 items-center justify-center rounded-md px-3 text-cell font-medium transition-colors duration-fast max-sm:h-11',
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
  ACTION_TONE_CLASSES.brand,
);

const FILE_BOX_CLASS_NAME =
  'rounded-md border border-border-default bg-surface px-3 py-2 text-caption text-fg-muted';
const FILE_NAME_CLASS_NAME = 'break-words text-cell font-medium text-fg';
const ACTION_ROW_CLASS_NAME = 'mt-2 flex flex-wrap items-center gap-2';

type ActionButtonProps = {
  busy?: boolean;
  tone?: keyof typeof ACTION_TONE_CLASSES;
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

function ActionButton({ busy, tone = 'neutral', label, onClick }: Readonly<ActionButtonProps>) {
  return (
    <Button variant="ghost" onClick={onClick} disabled={busy} className={ACTION_TONE_CLASSES[tone]}>
      {label}
    </Button>
  );
}

function EmptyPdfState({ busy, helperText, onChoosePdf }: Readonly<EmptyPdfStateProps>) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border-control bg-surface px-3 py-2">
      <div className="text-caption text-fg-subtle">{helperText}</div>
      <Button variant="secondary" onClick={onChoosePdf} disabled={busy} className="shrink-0">
        Choose PDF
      </Button>
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
    <div className={FILE_BOX_CLASS_NAME}>
      <p className={FILE_NAME_CLASS_NAME}>Selected: {selectedFile.name}</p>
      <p className="font-numeric">{formatPdfFileSize(selectedFile.size)}</p>
      <p className="mt-1 text-fg-subtle">{selectedHint}</p>
      <div className={ACTION_ROW_CLASS_NAME}>
        {onSelectedAction && selectedActionLabel && (
          <Button variant="secondary" onClick={onSelectedAction} disabled={busy}>
            {selectedActionLabel}
          </Button>
        )}
        <ActionButton busy={busy} onClick={onChoosePdf} label="Choose Different PDF" />
        <ActionButton busy={busy} onClick={onClearFile} label="Clear Selection" tone="danger" />
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
    <div className={FILE_BOX_CLASS_NAME}>
      <p className={FILE_NAME_CLASS_NAME}>Attached: {document.fileName}</p>
      <p className="font-numeric">{formatPdfFileSize(document.sizeBytes)}</p>
      <div className={ACTION_ROW_CLASS_NAME}>
        {downloadUrl && (
          <a href={downloadUrl} target="_blank" rel="noreferrer" className={LINK_ACTION_CLASS_NAME}>
            View PDF
          </a>
        )}
        <ActionButton busy={busy} onClick={onChoosePdf} label="Replace PDF" />
        {onRemoveDocument && (
          <ActionButton
            busy={busy}
            onClick={() => void onRemoveDocument()}
            label="Remove PDF"
            tone="danger"
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
      <div>
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
