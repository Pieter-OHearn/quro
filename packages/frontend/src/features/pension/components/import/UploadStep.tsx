import { useRef } from 'react';
import { Brain, FileText, Loader2, Upload } from 'lucide-react';

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
      className="relative border-2 border-dashed border-border-default rounded-2xl p-10 text-center hover:border-brand-border hover:bg-brand-soft/20 transition-all cursor-pointer group"
    >
      <div className="w-14 h-14 bg-brand-soft rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-brand-soft-strong transition-colors">
        <Upload size={22} className="text-brand-accent" />
      </div>
      <p className="text-sm text-fg-strong">
        Drop your PDF here, or <span className="text-brand font-medium">browse files</span>
      </p>
      <p className="text-xs text-fg-faint mt-1.5">
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
  if (!file) return <p className="text-center text-xs text-fg-faint mt-3">No file chosen</p>;

  return (
    <div className="mt-3 flex items-center gap-3 bg-success-soft border border-success-soft-strong rounded-xl px-4 py-3">
      <FileText size={15} className="text-success-accent flex-shrink-0" />
      <span className="text-sm text-success-fg font-medium flex-1 truncate">{file.name}</span>
      <span className="text-[10px] bg-success-soft-strong text-success px-2 py-0.5 rounded-full font-medium flex-shrink-0">
        Ready
      </span>
    </div>
  );
}

function UploadInfoPanel() {
  return (
    <div className="mt-4 flex items-start gap-2.5 bg-brand-soft/60 border border-brand-soft-strong rounded-xl px-4 py-3.5">
      <Brain size={14} className="text-brand-accent mt-0.5 flex-shrink-0" />
      <p className="text-xs text-brand-fg leading-relaxed">
        Quro&apos;s AI will extract contributions, fees, and annual totals. You&apos;ll review every
        row in a staging area before anything is committed to your ledger.
      </p>
    </div>
  );
}

type UploadFooterProps = {
  isUploading: boolean;
  onClose: () => void;
  onUpload: () => Promise<void>;
};

function UploadFooter({ isUploading, onClose, onUpload }: Readonly<UploadFooterProps>) {
  return (
    <div className="px-6 py-4 bg-surface-sunken border-t border-border-subtle flex gap-3">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-xl border border-border-default text-fg-muted py-2.5 text-sm hover:bg-surface transition-colors font-medium"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          void onUpload();
        }}
        disabled={isUploading}
        className="flex-1 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-80 disabled:cursor-not-allowed text-fg-inverted py-2.5 text-sm transition-colors font-medium flex items-center justify-center gap-2 shadow-sm shadow-brand-tint"
      >
        {isUploading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Upload size={14} />
            Upload &amp; Process
          </>
        )}
      </button>
    </div>
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
      <div className="p-6">
        <p className="text-sm text-fg-muted mb-5">
          Upload one annual statement PDF for{' '}
          <span className="font-semibold text-fg">{potName}</span>{' '}
          <span className="text-fg-faint">({provider})</span>.
        </p>
        <UploadDropzone provider={provider} onFileChange={onFileChange} />
        <UploadSelectedFile file={file} />
        <UploadInfoPanel />

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger-fg">
            {errorMessage}
          </div>
        )}
      </div>
      <UploadFooter isUploading={isUploading} onClose={onClose} onUpload={onUpload} />
    </>
  );
}
