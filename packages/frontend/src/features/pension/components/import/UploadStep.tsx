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
      className="relative border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer group"
    >
      <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-100 transition-colors">
        <Upload size={22} className="text-indigo-500" />
      </div>
      <p className="text-sm text-slate-700">
        Drop your PDF here, or <span className="text-indigo-600 font-medium">browse files</span>
      </p>
      <p className="text-xs text-slate-400 mt-1.5">
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
  if (!file) return <p className="text-center text-xs text-slate-400 mt-3">No file chosen</p>;

  return (
    <div className="mt-3 flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
      <FileText size={15} className="text-emerald-500 flex-shrink-0" />
      <span className="text-sm text-emerald-700 font-medium flex-1 truncate">{file.name}</span>
      <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
        Ready
      </span>
    </div>
  );
}

function UploadInfoPanel() {
  return (
    <div className="mt-4 flex items-start gap-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3.5">
      <Brain size={14} className="text-indigo-500 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-indigo-700 leading-relaxed">
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
    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-xl border border-slate-200 text-slate-600 py-2.5 text-sm hover:bg-white transition-colors font-medium"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          void onUpload();
        }}
        disabled={isUploading}
        className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-80 disabled:cursor-not-allowed text-white py-2.5 text-sm transition-colors font-medium flex items-center justify-center gap-2 shadow-sm shadow-indigo-200"
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
        <p className="text-sm text-slate-600 mb-5">
          Upload one annual statement PDF for{' '}
          <span className="font-semibold text-slate-900">{potName}</span>{' '}
          <span className="text-slate-400">({provider})</span>.
        </p>
        <UploadDropzone provider={provider} onFileChange={onFileChange} />
        <UploadSelectedFile file={file} />
        <UploadInfoPanel />

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage}
          </div>
        )}
      </div>
      <UploadFooter isUploading={isUploading} onClose={onClose} onUpload={onUpload} />
    </>
  );
}
