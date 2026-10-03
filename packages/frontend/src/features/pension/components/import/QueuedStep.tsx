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
  if (phaseKey === 'processing') return 'ring-indigo-100';
  if (phaseKey === 'ready') return 'ring-emerald-100';
  return 'ring-slate-100';
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
  return 'bg-slate-100 text-slate-300';
}

function getQueuePhaseLabelClass(isComplete: boolean, isActive: boolean): string {
  if (isComplete) return 'text-slate-500';
  if (isActive) return 'text-slate-800';
  return 'text-slate-300';
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
    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
      <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <CheckCircle2 size={14} className="text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-emerald-700">PDF submitted successfully</p>
        {fileName && <p className="text-[11px] text-emerald-600/70 truncate mt-0.5">{fileName}</p>}
      </div>
    </div>
  );
}

function QueuedPipeline({ jobPhase }: Readonly<{ jobPhase: JobPhase }>) {
  const currentIdx = PHASE_IDX[jobPhase];
  const connectorWidth = QUEUE_PHASE_CONNECTOR_WIDTH[currentIdx] ?? '0%';

  return (
    <div className="flex items-start justify-between relative">
      <div className="absolute top-[18px] left-[calc(16.67%+10px)] right-[calc(16.67%+10px)] h-[2px] bg-slate-100 z-0">
        <div
          className="h-full bg-indigo-400 transition-all duration-700"
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
                className={cn('text-[10px] mt-0.5', isActive ? 'text-slate-500' : 'text-slate-300')}
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
  if (jobPhase === 'queuing') return 'bg-slate-50 text-slate-500 border border-slate-100';
  if (jobPhase === 'processing') return 'bg-indigo-50 text-indigo-600 border border-indigo-100';
  return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
}

function QueuedStatusMessage({ jobPhase }: Readonly<{ jobPhase: JobPhase }>) {
  if (jobPhase === 'queuing') {
    return (
      <span className="flex items-center justify-center gap-2">
        <span className="flex gap-0.5">
          {QUEUE_BOUNCE_DOT_DELAYS_MS.map((delay) => (
            <span
              key={delay}
              className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"
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
        <Loader2 size={11} className="animate-spin text-indigo-400" />
        AI is extracting contributions, fees and totals from your PDF
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center gap-2">
      <CheckCircle2 size={11} className="text-emerald-500" />
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
        <p className="text-[11px] text-slate-400 text-center mt-2">Processed with {modelCaption}</p>
      )}
    </>
  );
}

function QueuedInfoPanel() {
  return (
    <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5">
      <Bell size={13} className="text-slate-400 mt-px flex-shrink-0" />
      <p className="text-xs text-slate-500 leading-relaxed">
        You can leave this window at any time - the job runs in the background. Return to review
        from the <span className="font-medium text-slate-600">notification bell</span> when
        it&apos;s ready. To stop the job entirely, use{' '}
        <span className="font-medium text-slate-600">Cancel Job</span>.
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
    <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 space-y-3">
      <div className="flex items-start gap-2.5">
        <XCircle size={14} className="text-rose-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-rose-700">Cancel this import job?</p>
          <p className="text-[11px] text-rose-500 mt-0.5 leading-relaxed">
            Processing will stop and the job will be removed from your notification list. This
            can&apos;t be undone.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSetConfirmMode('none')}
          className="flex-1 rounded-xl border border-slate-200 bg-white text-slate-600 py-2 text-xs hover:bg-slate-50 transition-colors font-medium"
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
          className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white py-2 text-xs transition-colors font-medium flex items-center justify-center gap-1.5 disabled:opacity-70"
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
        className="flex items-center gap-1.5 px-4 rounded-xl border border-rose-200 text-rose-500 py-2.5 text-sm hover:bg-rose-50 transition-colors font-medium"
      >
        <XCircle size={14} />
        Cancel Job
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-xl text-white py-2.5 text-sm transition-colors font-medium flex items-center justify-center gap-2 shadow-sm bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200"
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
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
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
