import { cn } from '@/lib/utils';
import { ArrowUpRight, Bell, Check, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { type ConfirmMode, type JobPhase } from '../../hooks/usePensionImportModalController';

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

const QUEUE_BOUNCE_DOT_DELAYS_MS = [0, 120, 240] as const;

function getQueuePhaseRingClass(phaseKey: JobPhase): string {
  if (phaseKey === 'processing') return 'ring-brand-soft-strong';
  if (phaseKey === 'ready') return 'ring-success-soft-strong';
  return 'ring-border-subtle';
}

function getQueuePhaseCircleClass(params: {
  isComplete: boolean;
  isActive: boolean;
  phase: (typeof PIPELINE)[number];
}): string {
  if (params.isComplete) return `${params.phase.completeCls} shadow-sm`;
  if (params.isActive) {
    return `${params.phase.activeCls} shadow-md ring-4 ring-offset-1 ${getQueuePhaseRingClass(
      params.phase.key,
    )}`;
  }
  return 'bg-surface-muted text-fg-disabled';
}

function getQueuePhaseLabelClass(isComplete: boolean, isActive: boolean): string {
  if (isComplete) return 'text-fg-subtle';
  if (isActive) return 'text-fg-emphasis';
  return 'text-fg-disabled';
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
  if (isComplete) return <Check size={15} />;
  if (isActive && phase.key === 'processing') return <Loader2 size={15} className="animate-spin" />;
  return <Icon size={15} />;
}

function QueuedFileBanner({ fileName }: Readonly<{ fileName: string }>) {
  return (
    <div className="flex items-center gap-3 bg-success-soft border border-success-soft-strong rounded-xl px-4 py-3">
      <div className="w-7 h-7 rounded-lg bg-success-soft-strong flex items-center justify-center flex-shrink-0">
        <CheckCircle2 size={14} className="text-success" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-success-fg">PDF submitted successfully</p>
        {fileName && <p className="text-[11px] text-success/70 truncate mt-0.5">{fileName}</p>}
      </div>
    </div>
  );
}

function QueuedPipeline({ jobPhase }: Readonly<{ jobPhase: JobPhase }>) {
  const currentIdx = PHASE_IDX[jobPhase];
  const connectorWidth = QUEUE_PHASE_CONNECTOR_WIDTH[currentIdx] ?? '0%';

  return (
    <div className="flex items-start justify-between relative">
      <div className="absolute top-[18px] left-[calc(16.67%+10px)] right-[calc(16.67%+10px)] h-[2px] bg-surface-muted z-0">
        <div
          className="h-full bg-brand-disabled transition-all duration-700"
          style={{ width: connectorWidth }}
        />
      </div>
      {PIPELINE.map((phase, idx) => {
        const isComplete = idx < currentIdx;
        const isActive = idx === currentIdx;
        return (
          <div key={phase.key} className="flex flex-col items-center gap-2 flex-1 z-10 relative">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 ${getQueuePhaseCircleClass(
                { isComplete, isActive, phase },
              )}`}
            >
              <QueuePhaseIcon isComplete={isComplete} isActive={isActive} phase={phase} />
            </div>
            <div className="text-center">
              <p
                className={`text-[11px] font-semibold ${getQueuePhaseLabelClass(isComplete, isActive)}`}
              >
                {phase.label}
              </p>
              <p
                className={cn(
                  'text-[10px] mt-0.5',
                  isActive ? 'text-fg-subtle' : 'text-fg-disabled',
                )}
              >
                {phase.sublabel}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getQueueStatusCaptionClass(jobPhase: JobPhase): string {
  if (jobPhase === 'queuing') return 'bg-surface-sunken text-fg-subtle border border-border-subtle';
  if (jobPhase === 'processing') return 'bg-brand-soft text-brand border border-brand-soft-strong';
  return 'bg-success-soft text-success-fg border border-success-soft-strong';
}

function QueuedStatusMessage({ jobPhase }: Readonly<{ jobPhase: JobPhase }>) {
  if (jobPhase === 'queuing') {
    return (
      <span className="flex items-center justify-center gap-2">
        <span className="flex gap-0.5">
          {QUEUE_BOUNCE_DOT_DELAYS_MS.map((delay) => (
            <span
              key={delay}
              className="w-1 h-1 bg-fg-faint rounded-full animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        Your PDF is waiting in the processing queue
      </span>
    );
  }
  if (jobPhase === 'processing') {
    return (
      <span className="flex items-center justify-center gap-2">
        <Loader2 size={11} className="animate-spin text-brand-disabled" />
        AI is extracting contributions, fees and totals from your PDF
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center gap-2">
      <CheckCircle2 size={11} className="text-success-accent" />
      <span>
        Transactions extracted - <strong>ready for your review</strong>
      </span>
    </span>
  );
}

function QueuedStatusCaption({
  jobPhase,
  modelCaption,
}: Readonly<{
  jobPhase: JobPhase;
  modelCaption: string | null;
}>) {
  return (
    <>
      <div
        className={`mt-4 text-center py-2.5 px-4 rounded-xl text-xs transition-all ${getQueueStatusCaptionClass(
          jobPhase,
        )}`}
      >
        <QueuedStatusMessage jobPhase={jobPhase} />
      </div>
      {modelCaption && (
        <p className="text-[11px] text-fg-faint text-center mt-2">Processed with {modelCaption}</p>
      )}
    </>
  );
}

function QueuedInfoPanel() {
  return (
    <div className="flex items-start gap-3 bg-surface-sunken border border-border-default rounded-xl px-4 py-3.5">
      <Bell size={13} className="text-fg-faint mt-px flex-shrink-0" />
      <p className="text-xs text-fg-subtle leading-relaxed">
        You can leave this window at any time - the job runs in the background. Return to review
        from the <span className="font-medium text-fg-muted">notification bell</span> when it&apos;s
        ready. To stop the job entirely, use{' '}
        <span className="font-medium text-fg-muted">Cancel Job</span>.
      </p>
    </div>
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
    <div className="bg-danger-soft border border-danger-border rounded-xl px-4 py-3 space-y-3">
      <div className="flex items-start gap-2.5">
        <XCircle size={14} className="text-danger mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-danger-fg">Cancel this import job?</p>
          <p className="text-[11px] text-danger mt-0.5 leading-relaxed">
            Processing will stop and the job will be removed from your notification list. This
            can&apos;t be undone.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSetConfirmMode('none')}
          className="flex-1 rounded-xl border border-border-default bg-surface text-fg-muted py-2 text-xs hover:bg-surface-sunken transition-colors font-medium"
        >
          Keep Running
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
          className="flex-1 rounded-xl bg-danger-hover hover:bg-danger-fg text-fg-inverted py-2 text-xs transition-colors font-medium flex items-center justify-center gap-1.5 disabled:opacity-70"
        >
          {isCancelling ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
          Confirm Cancel
        </button>
      </div>
    </div>
  );
}

function QueuedDefaultFooter({
  onSetConfirmMode,
  onClose,
}: Readonly<{
  onSetConfirmMode: (mode: ConfirmMode) => void;
  onClose: () => void;
}>) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => onSetConfirmMode('queued-cancel')}
        className="flex items-center gap-1.5 px-4 rounded-xl border border-danger-border text-danger py-2.5 text-sm hover:bg-danger-soft transition-colors font-medium"
      >
        <XCircle size={14} />
        Cancel Job
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-xl text-fg-inverted py-2.5 text-sm transition-colors font-medium flex items-center justify-center gap-2 shadow-sm bg-brand hover:bg-brand-hover shadow-brand-tint"
      >
        Continue in Background
        <ArrowUpRight size={14} />
      </button>
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
      <div className="p-6 space-y-5">
        <QueuedFileBanner fileName={fileName} />

        <div>
          <QueuedPipeline jobPhase={jobPhase} />
          <QueuedStatusCaption jobPhase={jobPhase} modelCaption={modelCaption} />
        </div>

        <QueuedInfoPanel />

        {errorMessage && (
          <div className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger-fg">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-surface-sunken border-t border-border-subtle">
        {confirmMode === 'queued-cancel' ? (
          <QueuedCancelConfirm
            isCancelling={isCancelling}
            onSetConfirmMode={onSetConfirmMode}
            onCancelJob={onCancelJob}
            onClose={onClose}
          />
        ) : (
          <QueuedDefaultFooter onSetConfirmMode={onSetConfirmMode} onClose={onClose} />
        )}
      </div>
    </>
  );
}
