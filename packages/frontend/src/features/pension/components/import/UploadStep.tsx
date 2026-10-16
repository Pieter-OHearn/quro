import { useRef } from 'react';
import { Brain, FileText, Upload } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { ImportBody, ImportFooter, ImportNotice } from './ImportChrome';

type UploadStepProps = {
  file: File | null;
  provider: string;
  potName: string;
  errorMessage: string;
  isUploading: boolean;
  onFileChange: (file: File | null) => void;
  onUpload: () => Promise<void>;
  onClose: () => void;
};

type UploadDropzoneProps = {
  provider: string;
  onFileChange: (file: File | null) => void;
};

function UploadDropzone({ provider, onFileChange }: Readonly<UploadDropzoneProps>) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => fileRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fileRef.current?.click();
        }
      }}
      className="relative cursor-pointer rounded-lg border border-dashed border-border-control px-4 py-8 text-center transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
    >
      <Upload size={16} className="mx-auto mb-2 text-fg-faint" aria-hidden />
      <p className="text-cell text-fg">
        Drop your PDF here, or <span className="font-medium text-brand">browse files</span>
      </p>
      <p className="mt-1 text-caption text-fg-subtle">
        Annual statement PDF from {provider} · Max 20 MB
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function UploadSelectedFile({ file }: Readonly<{ file: File | null }>) {
  if (!file) return <p className="text-center text-caption text-fg-subtle">No file chosen</p>;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border-default px-3 py-2">
      <FileText size={14} className="shrink-0 text-fg-faint" aria-hidden />
      <span className="flex-1 truncate text-cell text-fg">{file.name}</span>
      <Badge tone="success" className="shrink-0">
        Ready
      </Badge>
    </div>
  );
}

function UploadInfoPanel() {
  return (
    <p className="flex items-start gap-2 text-caption text-fg-subtle">
      <Brain size={12} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
      Statement import is experimental. A local model reads contributions, fees, and annual totals,
      and its output can be wrong. You&apos;ll review every row in a staging area before anything is
      committed to your ledger.
    </p>
  );
}

type UploadFooterProps = {
  isUploading: boolean;
  onClose: () => void;
  onUpload: () => Promise<void>;
};

function UploadFooter({ isUploading, onClose, onUpload }: Readonly<UploadFooterProps>) {
  return (
    <ImportFooter>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button
        onClick={() => {
          void onUpload();
        }}
        loading={isUploading}
        loadingLabel="Submitting..."
        leadingIcon={<Upload size={14} aria-hidden />}
      >
        Upload &amp; process
      </Button>
    </ImportFooter>
  );
}

export function UploadStep({
  file,
  provider,
  potName,
  errorMessage,
  isUploading,
  onFileChange,
  onUpload,
  onClose,
}: Readonly<UploadStepProps>) {
  return (
    <>
      <ImportBody className="space-y-3">
        <p className="text-body text-fg-muted">
          Upload one annual statement PDF for <span className="font-medium text-fg">{potName}</span>{' '}
          <span className="text-fg-subtle">({provider})</span>.
        </p>
        <UploadDropzone provider={provider} onFileChange={onFileChange} />
        <UploadSelectedFile file={file} />
        <UploadInfoPanel />
        {errorMessage && <ImportNotice tone="danger">{errorMessage}</ImportNotice>}
      </ImportBody>
      <UploadFooter isUploading={isUploading} onClose={onClose} onUpload={onUpload} />
    </>
  );
}
