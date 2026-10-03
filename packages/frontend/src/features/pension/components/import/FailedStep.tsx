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
        <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger-fg">
          Import failed: {importErrorMessage || 'Unknown parser error'}
        </div>
        {errorMessage && (
          <div className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger-fg">
            {errorMessage}
          </div>
        )}
      </div>
      <div className="px-6 py-4 bg-surface-sunken border-t border-border-subtle flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-border-default text-fg-muted px-5 py-2.5 text-sm hover:bg-surface transition-colors font-medium"
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
          className="flex-1 rounded-xl bg-danger-hover hover:bg-danger-fg disabled:opacity-70 disabled:cursor-not-allowed text-fg-inverted py-2.5 text-sm transition-colors font-medium flex items-center justify-center gap-2"
        >
          {isCancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
          Clear failed job
        </button>
      </div>
    </>
  );
}
