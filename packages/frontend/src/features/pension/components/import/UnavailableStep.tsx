type UnavailableStepProps = {
  errorMessage: string;
  onClose: () => void;
};

export function UnavailableStep({ errorMessage, onClose }: Readonly<UnavailableStepProps>) {
  return (
    <>
      <div className="p-6 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          This import is no longer available. It may have expired, been cancelled, or does not
          belong to this pension pot.
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
          className="flex-1 rounded-xl border border-slate-200 text-slate-600 py-2.5 text-sm hover:bg-white transition-colors font-medium"
        >
          Close
        </button>
      </div>
    </>
  );
}
