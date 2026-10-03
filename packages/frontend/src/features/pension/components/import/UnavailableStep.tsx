type UnavailableStepProps = {
  errorMessage: string;
  onClose: () => void;
};

export function UnavailableStep({ errorMessage, onClose }: Readonly<UnavailableStepProps>) {
  return (
    <>
      <div className="p-6 space-y-4">
        <div className="rounded-xl border border-border-default bg-surface-sunken px-4 py-3 text-sm text-fg-muted">
          This import is no longer available. It may have expired, been cancelled, or does not
          belong to this pension pot.
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
          className="flex-1 rounded-xl border border-border-default text-fg-muted py-2.5 text-sm hover:bg-surface transition-colors font-medium"
        >
          Close
        </button>
      </div>
    </>
  );
}
