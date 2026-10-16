import type { PensionPot } from '@quro/shared';
import { Loader2, Sparkles, X } from 'lucide-react';
import { Badge, IconButton } from '@/components/ui';
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

// The shared dialog header: title, pot caption, a status badge and the close button.
export function ImportHeader({ pot, step, jobPhase, onClose }: Readonly<HeaderProps>) {
  return (
    <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border-default px-4 py-2">
      <div className="min-w-0">
        <h2 className="text-title-section text-fg">Import annual statement</h2>
        <p className="truncate text-caption text-fg-subtle">
          {pot.emoji} {pot.name}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {step === 'review' && (
          <Badge>
            <Sparkles size={10} aria-hidden />
            Read by OCR
          </Badge>
        )}
        {step === 'queued' && (
          <Badge tone={jobPhase === 'ready' ? 'success' : 'neutral'}>
            <Loader2
              size={10}
              aria-hidden
              className={jobPhase !== 'ready' ? 'animate-spin' : undefined}
            />
            {jobPhase === 'ready' ? 'Ready to review' : 'Running in background'}
          </Badge>
        )}
        <IconButton
          icon={X}
          onClick={onClose}
          label="Close dialog"
          title={step === 'queued' ? 'Close (job continues in background)' : 'Close'}
          variant="subtle"
        />
      </div>
    </div>
  );
}
