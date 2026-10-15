import { cn } from '@/lib/utils';
import { ArrowUpRight, Bell, Check, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { type ConfirmMode, type JobPhase } from '../../hooks/usePensionImportModalController';
import { ImportBody, ImportFooter, ImportNotice } from './ImportChrome';
import { PIPELINE, PHASE_IDX } from './phaseMetadata';

type QueuedStepProps = {
  fileName: string;
  jobPhase: JobPhase;
  confirmMode: ConfirmMode;
  isCancelling: boolean;
  errorMessage: string;
  modelCaption: string | null;
  onSetConfirmMode: (mode: ConfirmMode) => void;
  onCancelJob: () => Promise<boolean>;
  onClose: () => void;
};

const QUEUE_PHASE_CONNECTOR_WIDTH: Record<number, string> = {
  0: '0%',
  1: '50%',
  2: '100%',
};

// Done steps are a brand-soft dot with a check, the current step has a brand edge.
function getQueuePhaseDotClass(isComplete: boolean, isActive: boolean): string {
  if (isComplete) return 'bg-brand-soft text-brand-fg';
  if (isActive) return 'border border-brand bg-surface text-brand';
  return 'bg-surface-muted text-fg-faint';
}

function QueuePhaseIcon({
  isComplete,
  isActive,
  phase,
}: Readonly<{
  isComplete: boolean;
  isActive: boolean;
  phase: (typeof PIPELINE)[number];
}>) {
  const { Icon } = phase;
  if (isComplete) return <Check size={12} aria-hidden />;
  if (isActive && phase.key === 'processing') {
    return <Loader2 size={12} className="animate-spin" aria-hidden />;
  }
  return <Icon size={12} aria-hidden />;
}

function QueuedFileBanner({ fileName }: Readonly<{ fileName: string }>) {
  return (
    <ImportNotice tone="success" className="flex items-start gap-2">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">PDF submitted successfully</p>
        {fileName && <p className="truncate text-caption text-fg-muted">{fileName}</p>}
      </div>
    </ImportNotice>
  );
}

function QueuedPipeline({ jobPhase }: Readonly<{ jobPhase: JobPhase }>) {
  const currentIdx = PHASE_IDX[jobPhase];
  const connectorWidth = QUEUE_PHASE_CONNECTOR_WIDTH[currentIdx] ?? '0%';

  return (
    <ol className="relative flex items-start justify-between">
      <li
        aria-hidden
        className="absolute left-[16.67%] right-[16.67%] top-3 h-px bg-border-default"
      >
        <span
          className="block h-full bg-brand motion-safe:transition-[width] motion-safe:duration-slow"
          style={{ width: connectorWidth }}
        />
      </li>
      {PIPELINE.map((phase, idx) => {
        const isComplete = idx < currentIdx;
        const isActive = idx === currentIdx;
        return (
          <li
            key={phase.key}
            aria-current={isActive ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-1.5"
          >
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full',
                getQueuePhaseDotClass(isComplete, isActive),
              )}
            >
              <QueuePhaseIcon isComplete={isComplete} isActive={isActive} phase={phase} />
            </span>
            <span className="text-center">
              <span
                className={cn(
                  'block text-label',
                  isActive || isComplete ? 'text-fg' : 'text-fg-subtle',
                )}
              >
                {phase.label}
              </span>
              <span className="block text-caption text-fg-subtle">{phase.sublabel}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function QueuedStatusMessage({ jobPhase }: Readonly<{ jobPhase: JobPhase }>) {
  if (jobPhase === 'queuing') {
    return (
      <ImportNotice tone="neutral" className="text-center">
        Your PDF is waiting in the processing queue
      </ImportNotice>
    );
  }
  if (jobPhase === 'processing') {
    return (
      <ImportNotice tone="info" className="flex items-center justify-center gap-2">
        <Loader2 size={12} className="animate-spin" aria-hidden />
        AI is extracting contributions, fees and totals from your PDF
      </ImportNotice>
    );
  }
  return (
    <ImportNotice tone="success" className="flex items-center justify-center gap-2">
      <CheckCircle2 size={12} aria-hidden />
      <span>
        Transactions extracted - <strong className="font-medium">ready for your review</strong>
      </span>
    </ImportNotice>
  );
}

function QueuedInfoPanel() {
  return (
    <p className="flex items-start gap-2 text-caption text-fg-subtle">
      <Bell size={12} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
      <span>
        You can leave this window at any time - the job runs in the background. Return to review
        from the <span className="font-medium text-fg-muted">notification bell</span> when it&apos;s
        ready. To stop the job entirely, use{' '}
        <span className="font-medium text-fg-muted">Cancel job</span>.
      </span>
    </p>
  );
}

type QueuedCancelConfirmProps = {
  isCancelling: boolean;
  onSetConfirmMode: (mode: ConfirmMode) => void;
  onCancelJob: () => Promise<boolean>;
  onClose: () => void;
};

function QueuedCancelConfirm({
  isCancelling,
  onSetConfirmMode,
  onCancelJob,
  onClose,
}: Readonly<QueuedCancelConfirmProps>) {
  return (
    <div className="w-full space-y-2">
      <ImportNotice tone="danger" className="flex items-start gap-2">
        <XCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">Cancel this import job?</p>
          <p className="text-caption">
            Processing will stop and the job will be removed from your notification list. This
            can&apos;t be undone.
          </p>
        </div>
      </ImportNotice>
      <div className="flex justify-end gap-2 max-sm:flex-col max-sm:*:w-full">
        <Button variant="secondary" onClick={() => onSetConfirmMode('none')}>
          Keep running
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            void (async () => {
              const cancelled = await onCancelJob();
              if (cancelled) onClose();
            })();
          }}
          loading={isCancelling}
          leadingIcon={<XCircle size={14} aria-hidden />}
        >
          Confirm cancel
        </Button>
      </div>
    </div>
  );
}

export function QueuedStep({
  fileName,
  jobPhase,
  confirmMode,
  isCancelling,
  errorMessage,
  modelCaption,
  onSetConfirmMode,
  onCancelJob,
  onClose,
}: Readonly<QueuedStepProps>) {
  return (
    <>
      <ImportBody>
        <QueuedFileBanner fileName={fileName} />
        <div className="space-y-3">
          <QueuedPipeline jobPhase={jobPhase} />
          <QueuedStatusMessage jobPhase={jobPhase} />
          {modelCaption && (
            <p className="text-center text-caption text-fg-subtle">Processed with {modelCaption}</p>
          )}
        </div>
        <QueuedInfoPanel />
        {errorMessage && <ImportNotice tone="danger">{errorMessage}</ImportNotice>}
      </ImportBody>

      {confirmMode === 'queued-cancel' ? (
        <div className="shrink-0 border-t border-border-default bg-surface-sunken px-4 py-3">
          <QueuedCancelConfirm
            isCancelling={isCancelling}
            onSetConfirmMode={onSetConfirmMode}
            onCancelJob={onCancelJob}
            onClose={onClose}
          />
        </div>
      ) : (
        <ImportFooter>
          <Button
            variant="danger"
            onClick={() => onSetConfirmMode('queued-cancel')}
            leadingIcon={<XCircle size={14} aria-hidden />}
          >
            Cancel job
          </Button>
          <Button onClick={onClose} trailingIcon={<ArrowUpRight size={14} aria-hidden />}>
            Continue in background
          </Button>
        </ImportFooter>
      )}
    </>
  );
}
