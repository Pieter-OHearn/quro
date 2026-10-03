import { Loader2, XCircle } from 'lucide-react';

type FailedStepProps = {
  importErrorMessage: string | null;
  errorMessage: string;
  isCancelling: boolean;
  onCancelJob: () => Promise<boolean>;
  onClose: () => void;
};

export function FailedStep({
  importErrorMessage,
  errorMessage,
  isCancelling,
  onCancelJob,
  onClose,
}: Readonly<FailedStepProps>) {
  return (
    <>
      <div className="p-6 space-y-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Import failed: {importErrorMessage || 'Unknown parser error'}
        </div>
        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage}
          </div>
        )}
      </div>
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 text-slate-600 px-5 py-2.5 text-sm hover:bg-white transition-colors font-medium"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const cancelled = await onCancelJob();
              if (cancelled) onClose();
            })();
          }}
          disabled={isCancelling}
          className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-70 disabled:cursor-not-allowed text-white py-2.5 text-sm transition-colors font-medium flex items-center justify-center gap-2"
        >
          {isCancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
          Clear failed job
        </button>
      </div>
    </>
  );
}
