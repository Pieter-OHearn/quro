import type { PensionPot } from '@quro/shared';
import { Loader2, Sparkles, X } from 'lucide-react';
import {
  type JobPhase,
  type PensionImportModalStep,
} from '../../hooks/usePensionImportModalController';

type HeaderProps = {
  pot: PensionPot;
  step: PensionImportModalStep;
  jobPhase: JobPhase;
  onClose: () => void;
};

export function ImportHeader({ pot, step, jobPhase, onClose }: Readonly<HeaderProps>) {
  return (
    <div className="bg-gradient-to-r from-surface-inverse to-surface-inverse-panel px-6 py-5 flex items-center justify-between flex-shrink-0">
      <div>
        <h2 className="font-bold text-fg-inverted">Import Annual Statement</h2>
        <p className="text-xs text-warning-muted mt-0.5">
          {pot.emoji} {pot.name}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {step === 'review' && (
          <span className="flex items-center gap-1.5 text-[10px] bg-surface/10 text-fg-disabled px-2.5 py-1 rounded-full">
            <Sparkles size={10} className="text-warning-muted" />
            Parsed by AI
          </span>
        )}
        {step === 'queued' && (
          <span className="flex items-center gap-1.5 text-[10px] bg-surface/10 text-fg-disabled px-2.5 py-1 rounded-full">
            <Loader2
              size={10}
              className={
                jobPhase !== 'ready' ? 'animate-spin text-brand-border' : 'text-success-muted'
              }
            />
            {jobPhase === 'ready' ? 'Ready to review' : 'Running in background'}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-surface/10 text-fg-faint hover:text-fg-inverted transition-colors"
          aria-label="Close dialog"
          title={step === 'queued' ? 'Close (job continues in background)' : 'Close'}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
