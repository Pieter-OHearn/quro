import { useRef } from 'react';
import type { PensionStatementImportRow, PensionPot } from '@quro/shared';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  usePensionImportModalController,
  type ConfirmMode,
  type JobPhase,
  type PensionImportModalStep,
} from '../hooks/usePensionImportModalController';

const GRID = '130px 86px 112px 1fr 74px 64px';

type ImportPensionStatementModalProps = {
  pot: PensionPot;
  onClose: () => void;
  initialImportId?: number | null;
};

type ConfidenceLevel = PensionStatementImportRow['confidenceLabel'];

type RowDraft = {
  type: PensionStatementImportRow['type'];
  amount: string;
  taxAmount: string;
  date: string;
  note: string;
  isEmployer: boolean | null;
};

type TypeMeta = {
  label: string;
  accent: string;
};

const TYPE_META: Record<PensionStatementImportRow['type'], TypeMeta> = {
  contribution: { label: 'Contribution', accent: 'bg-emerald-400' },
  fee: { label: 'Fee', accent: 'bg-rose-400' },
  annual_statement: { label: 'Annual Statement', accent: 'bg-amber-400' },
};

const CONF_META: Record<ConfidenceLevel, { label: string; cls: string }> = {
  high: { label: 'high', cls: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  medium: { label: 'medium', cls: 'bg-amber-50 text-amber-600 border border-amber-200' },
  low: { label: 'low', cls: 'bg-rose-50 text-rose-500 border border-rose-200' },
};

const PIPELINE: {
  key: JobPhase;
  label: string;
  sublabel: string;
  Icon: React.ElementType;
  activeCls: string;
  completeCls: string;
}[] = [
  {
    key: 'queuing',
    label: 'Queued',
    sublabel: 'Waiting in queue',
    Icon: Clock,
    activeCls: 'bg-slate-700 text-white',
    completeCls: 'bg-slate-700 text-white',
  },
  {
    key: 'processing',
    label: 'Processing',
    sublabel: 'AI reading your PDF',
    Icon: Brain,
    activeCls: 'bg-indigo-600 text-white',
    completeCls: 'bg-indigo-500 text-white',
  },
  {
    key: 'ready',
    label: 'Review Ready',
    sublabel: 'Transactions extracted',
    Icon: Sparkles,
    activeCls: 'bg-emerald-600 text-white',
    completeCls: 'bg-emerald-500 text-white',
  },
];

const PHASE_IDX: Record<JobPhase, number> = {
  queuing: 0,
  processing: 1,
  ready: 2,
};

type HeaderProps = {
  pot: PensionPot;
  step: PensionImportModalStep;
  jobPhase: JobPhase;
  onClose: () => void;
};

function Header({ pot, step, jobPhase, onClose }: Readonly<HeaderProps>) {
  return (
    <div className="bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-6 py-5 flex items-center justify-between flex-shrink-0">
      <div>
        <h2 className="font-bold text-white">Import Annual Statement</h2>
        <p className="text-xs text-amber-400 mt-0.5">
          {pot.emoji} {pot.name}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {step === 'review' && (
          <span className="flex items-center gap-1.5 text-[10px] bg-white/10 text-slate-300 px-2.5 py-1 rounded-full">
            <Sparkles size={10} className="text-amber-400" />
            Parsed by AI
          </span>
        )}
        {step === 'queued' && (
          <span className="flex items-center gap-1.5 text-[10px] bg-white/10 text-slate-300 px-2.5 py-1 rounded-full">
            <Loader2
              size={10}
              className={jobPhase !== 'ready' ? 'animate-spin text-indigo-300' : 'text-emerald-400'}
            />
            {jobPhase === 'ready' ? 'Ready to review' : 'Running in background'}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          title={step === 'queued' ? 'Close (job continues in background)' : 'Close'}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

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

function UploadStep({
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

function getQueuePhaseSublabelClass(isActive: boolean): string {
  return isActive ? 'text-slate-500' : 'text-slate-300';
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
              <p className={`text-[10px] mt-0.5 ${getQueuePhaseSublabelClass(isActive)}`}>
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

function QueuedStep({
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

type RowActionProps = {
  row: PensionStatementImportRow;
  draft: RowDraft;
  isSaved: boolean;
  isRowBusy: boolean;
  saving: boolean;
  deleting: boolean;
  onPatch: (row: PensionStatementImportRow, changes: Partial<RowDraft>) => void;
  onToggleReviewed: (row: PensionStatementImportRow) => void;
  onToggleDelete: (row: PensionStatementImportRow) => Promise<void>;
};

function getReviewRowContainerClass(isSaved: boolean): string {
  return isSaved
    ? 'border-emerald-200 bg-emerald-50/20'
    : 'border-slate-100 hover:border-slate-200 bg-white';
}

function getEmployerBadgeClass(isEmployer: boolean): string {
  return isEmployer
    ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
    : 'bg-emerald-50 border-emerald-200 text-emerald-600';
}

function getReviewSavedButtonClass(isSaved: boolean): string {
  return isSaved
    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-100'
    : 'border border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50';
}

function ReviewDeletedRow({
  row,
  draft,
  typeMeta,
  deleting,
  isRowBusy,
  onToggleDelete,
}: Readonly<{
  row: PensionStatementImportRow;
  draft: RowDraft;
  typeMeta: TypeMeta;
  deleting: boolean;
  isRowBusy: boolean;
  onToggleDelete: (row: PensionStatementImportRow) => Promise<void>;
}>) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 opacity-50">
      <div className="w-1 flex-shrink-0" />
      <span className="text-xs text-slate-400 line-through flex-1">
        {typeMeta.label} · {draft.amount} · {draft.date}
      </span>
      <button
        type="button"
        onClick={() => {
          void onToggleDelete(row);
        }}
        disabled={isRowBusy}
        className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors flex-shrink-0 disabled:opacity-60"
      >
        {deleting ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />} Undo
      </button>
    </div>
  );
}

type ReviewTypeCellProps = {
  row: PensionStatementImportRow;
  draft: RowDraft;
  onPatch: (row: PensionStatementImportRow, changes: Partial<RowDraft>) => void;
};

function ReviewTypeCell({ row, draft, onPatch }: Readonly<ReviewTypeCellProps>) {
  return (
    <div className="space-y-1.5 min-w-0">
      <select
        value={draft.type}
        onChange={(event) => {
          const nextType = event.target.value as PensionStatementImportRow['type'];
          onPatch(row, {
            type: nextType,
            isEmployer: nextType === 'contribution' ? (draft.isEmployer ?? false) : null,
          });
        }}
        className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 text-slate-700"
      >
        <option value="contribution">Contribution</option>
        <option value="fee">Fee</option>
        <option value="annual_statement">Annual Statement</option>
      </select>

      {draft.type === 'contribution' && (
        <button
          type="button"
          onClick={() => onPatch(row, { isEmployer: !(draft.isEmployer ?? false) })}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${getEmployerBadgeClass(
            Boolean(draft.isEmployer),
          )}`}
        >
          {draft.isEmployer ? 'Employer' : 'Employee'}
        </button>
      )}

      {row.isDerived && (
        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded-full">
          <Brain size={9} /> AI derived
        </span>
      )}
    </div>
  );
}

function ReviewNoteCell({
  row,
  draft,
  onPatch,
}: Readonly<{
  row: PensionStatementImportRow;
  draft: RowDraft;
  onPatch: (row: PensionStatementImportRow, changes: Partial<RowDraft>) => void;
}>) {
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={draft.note}
        onChange={(event) => onPatch(row, { note: event.target.value })}
        className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 text-slate-500 w-full"
        placeholder="Add note..."
      />
      {row.collisionWarning && (
        <p className="text-[10px] text-amber-700 truncate">{row.collisionWarning.reason}</p>
      )}
    </div>
  );
}

function ReviewConfidenceCell({
  row,
  confidenceMeta,
}: Readonly<{
  row: PensionStatementImportRow;
  confidenceMeta: { label: string; cls: string };
}>) {
  return (
    <div className="flex flex-col items-center gap-1 pt-1">
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${confidenceMeta.cls}`}
      >
        {confidenceMeta.label}
      </span>
      {row.isDerived && <span className="text-[9px] text-amber-500 font-medium">derived</span>}
    </div>
  );
}

type ReviewActionsCellProps = {
  row: PensionStatementImportRow;
  isSaved: boolean;
  isRowBusy: boolean;
  saving: boolean;
  deleting: boolean;
  onToggleReviewed: (row: PensionStatementImportRow) => void;
  onToggleDelete: (row: PensionStatementImportRow) => Promise<void>;
};

function ReviewActionsCell({
  row,
  isSaved,
  isRowBusy,
  saving,
  deleting,
  onToggleReviewed,
  onToggleDelete,
}: Readonly<ReviewActionsCellProps>) {
  return (
    <div className="flex items-center justify-end gap-1.5 pt-0.5">
      <button
        type="button"
        onClick={() => onToggleReviewed(row)}
        disabled={isRowBusy}
        title={isSaved ? 'Reviewed' : 'Mark as reviewed'}
        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all flex-shrink-0 ${getReviewSavedButtonClass(
          isSaved,
        )} disabled:opacity-60`}
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button
        type="button"
        onClick={() => {
          void onToggleDelete(row);
        }}
        disabled={isRowBusy}
        title="Remove row"
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-transparent text-slate-300 hover:border-rose-200 hover:text-rose-500 hover:bg-rose-50 transition-all flex-shrink-0 disabled:opacity-60"
      >
        {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
      </button>
    </div>
  );
}

function ReviewEditableRow({
  row,
  draft,
  isSaved,
  isRowBusy,
  saving,
  deleting,
  onPatch,
  onToggleReviewed,
  onToggleDelete,
}: Readonly<RowActionProps>) {
  const typeMeta = TYPE_META[draft.type] ?? TYPE_META.contribution;
  const confidenceMeta = CONF_META[row.confidenceLabel];

  return (
    <div
      className={`flex items-start rounded-xl border transition-all overflow-hidden ${getReviewRowContainerClass(isSaved)}`}
    >
      <div className={`w-1 self-stretch flex-shrink-0 ${typeMeta.accent}`} />
      <div
        className="flex-1 grid gap-2 px-3 py-3 items-start min-w-0"
        style={{ gridTemplateColumns: GRID }}
      >
        <ReviewTypeCell row={row} draft={draft} onPatch={onPatch} />

        <input
          type="number"
          step="0.01"
          value={draft.amount}
          onChange={(event) => onPatch(row, { amount: event.target.value })}
          className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 text-slate-700 w-full"
          placeholder="0.00"
        />

        <input
          type="date"
          value={draft.date}
          onChange={(event) => onPatch(row, { date: event.target.value })}
          className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 text-slate-700 w-full"
        />

        <ReviewNoteCell row={row} draft={draft} onPatch={onPatch} />
        <ReviewConfidenceCell row={row} confidenceMeta={confidenceMeta} />
        <ReviewActionsCell
          row={row}
          isSaved={isSaved}
          isRowBusy={isRowBusy}
          saving={saving}
          deleting={deleting}
          onToggleReviewed={onToggleReviewed}
          onToggleDelete={onToggleDelete}
        />
      </div>
    </div>
  );
}

function ReviewRow({
  row,
  draft,
  isSaved,
  isRowBusy,
  saving,
  deleting,
  onPatch,
  onToggleReviewed,
  onToggleDelete,
}: Readonly<RowActionProps>) {
  const typeMeta = TYPE_META[draft.type] ?? TYPE_META.contribution;
  if (row.isDeleted) {
    return (
      <ReviewDeletedRow
        row={row}
        draft={draft}
        typeMeta={typeMeta}
        deleting={deleting}
        isRowBusy={isRowBusy}
        onToggleDelete={onToggleDelete}
      />
    );
  }
  return (
    <ReviewEditableRow
      row={row}
      draft={draft}
      isSaved={isSaved}
      isRowBusy={isRowBusy}
      saving={saving}
      deleting={deleting}
      onPatch={onPatch}
      onToggleReviewed={onToggleReviewed}
      onToggleDelete={onToggleDelete}
    />
  );
}

type ReviewStepProps = {
  rows: PensionStatementImportRow[];
  activeRows: PensionStatementImportRow[];
  deletedRows: PensionStatementImportRow[];
  warnRows: PensionStatementImportRow[];
  derivedRows: PensionStatementImportRow[];
  confirmMode: ConfirmMode;
  canCommit: boolean;
  reviewBusy: boolean;
  isCommitting: boolean;
  isCancelling: boolean;
  savingRowId: number | null;
  deletingRowId: number | null;
  savedRowIds: Set<number>;
  errorMessage: string;
  onSetConfirmMode: (mode: ConfirmMode) => void;
  onGetDraft: (row: PensionStatementImportRow) => RowDraft;
  onPatch: (row: PensionStatementImportRow, changes: Partial<RowDraft>) => void;
  onToggleReviewed: (row: PensionStatementImportRow) => void;
  onToggleDelete: (row: PensionStatementImportRow) => Promise<void>;
  onCommit: () => Promise<boolean>;
  onCancelJob: () => Promise<boolean>;
  onClose: () => void;
};

function ReviewSummaryChips({
  activeRows,
  deletedRows,
  warnRows,
  derivedRows,
}: Readonly<{
  activeRows: PensionStatementImportRow[];
  deletedRows: PensionStatementImportRow[];
  warnRows: PensionStatementImportRow[];
  derivedRows: PensionStatementImportRow[];
}>) {
  return (
    <div className="px-5 pt-4 pb-3 flex-shrink-0 flex items-center gap-2 flex-wrap border-b border-slate-100">
      <span className="flex items-center gap-1.5 text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
        {activeRows.length} active row{activeRows.length !== 1 ? 's' : ''}
      </span>
      {derivedRows.length > 0 && (
        <span className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-full">
          <Brain size={11} className="flex-shrink-0" />
          {derivedRows.length} AI derived
        </span>
      )}
      {warnRows.length > 0 && (
        <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1.5 rounded-full">
          <AlertTriangle size={11} className="flex-shrink-0" />
          {warnRows.length} need{warnRows.length === 1 ? 's' : ''} review
        </span>
      )}
      {deletedRows.length > 0 && (
        <span className="flex items-center gap-1.5 text-xs bg-slate-100 text-slate-400 px-3 py-1.5 rounded-full ml-auto">
          {deletedRows.length} removed
        </span>
      )}
    </div>
  );
}

function ReviewTableHeader() {
  return (
    <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-100 px-5 py-2.5 flex items-center">
      <div className="w-1 mr-3 flex-shrink-0" />
      <div
        className="flex-1 grid gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider"
        style={{ gridTemplateColumns: GRID }}
      >
        <span>Type</span>
        <span>Amount</span>
        <span>Date</span>
        <span>Note</span>
        <span className="text-center">Confidence</span>
        <span className="text-right">Actions</span>
      </div>
    </div>
  );
}

type ReviewRowsListProps = {
  rows: PensionStatementImportRow[];
  savingRowId: number | null;
  deletingRowId: number | null;
  savedRowIds: Set<number>;
  onGetDraft: (row: PensionStatementImportRow) => RowDraft;
  onPatch: (row: PensionStatementImportRow, changes: Partial<RowDraft>) => void;
  onToggleReviewed: (row: PensionStatementImportRow) => void;
  onToggleDelete: (row: PensionStatementImportRow) => Promise<void>;
};

function ReviewRowsList({
  rows,
  savingRowId,
  deletingRowId,
  savedRowIds,
  onGetDraft,
  onPatch,
  onToggleReviewed,
  onToggleDelete,
}: Readonly<ReviewRowsListProps>) {
  return (
    <div className="px-5 py-3 space-y-2">
      {rows.map((row) => (
        <ReviewRow
          key={row.id}
          row={row}
          draft={onGetDraft(row)}
          isSaved={savedRowIds.has(row.id)}
          isRowBusy={savingRowId === row.id || deletingRowId === row.id}
          saving={savingRowId === row.id}
          deleting={deletingRowId === row.id}
          onPatch={onPatch}
          onToggleReviewed={onToggleReviewed}
          onToggleDelete={onToggleDelete}
        />
      ))}
    </div>
  );
}

type ReviewCancelConfirmProps = {
  isCancelling: boolean;
  onSetConfirmMode: (mode: ConfirmMode) => void;
  onCancelJob: () => Promise<boolean>;
  onClose: () => void;
};

function ReviewCancelConfirm({
  isCancelling,
  onSetConfirmMode,
  onCancelJob,
  onClose,
}: Readonly<ReviewCancelConfirmProps>) {
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 space-y-3">
      <div className="flex items-start gap-2.5">
        <XCircle size={14} className="text-rose-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-rose-700">Discard this import?</p>
          <p className="text-[11px] text-rose-500 mt-0.5 leading-relaxed">
            All staged transactions will be discarded and the job will be removed from your
            notification list. Nothing will be added to your ledger.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSetConfirmMode('none')}
          className="flex-1 rounded-xl border border-slate-200 bg-white text-slate-600 py-2 text-xs hover:bg-slate-50 transition-colors font-medium"
        >
          Keep Reviewing
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
          Discard &amp; Cancel
        </button>
      </div>
    </div>
  );
}

function ReviewDefaultFooter({
  activeRows,
  deletedRows,
  warnRows,
  canCommit,
  reviewBusy,
  isCommitting,
  onSetConfirmMode,
  onCommit,
  onClose,
}: Readonly<{
  activeRows: PensionStatementImportRow[];
  deletedRows: PensionStatementImportRow[];
  warnRows: PensionStatementImportRow[];
  canCommit: boolean;
  reviewBusy: boolean;
  isCommitting: boolean;
  onSetConfirmMode: (mode: ConfirmMode) => void;
  onCommit: () => Promise<boolean>;
  onClose: () => void;
}>) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onSetConfirmMode('review-cancel')}
          className="flex items-center gap-1.5 px-4 rounded-xl border border-rose-200 text-rose-500 py-2.5 text-sm hover:bg-rose-50 transition-colors font-medium whitespace-nowrap"
        >
          <XCircle size={14} />
          Cancel Job
        </button>
        <p className="text-xs text-slate-500 hidden sm:block">
          <span className="font-semibold text-slate-700">{activeRows.length}</span> transaction
          {activeRows.length !== 1 ? 's' : ''} to commit
          {deletedRows.length > 0 && (
            <span className="text-slate-400 ml-1.5">· {deletedRows.length} removed</span>
          )}
          {warnRows.length > 0 && (
            <span className="text-amber-500 ml-1.5">· {warnRows.length} flagged</span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          void (async () => {
            const committed = await onCommit();
            if (committed) onClose();
          })();
        }}
        disabled={!canCommit || reviewBusy}
        className="px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 text-sm transition-colors font-medium shadow-sm shadow-indigo-200 whitespace-nowrap"
      >
        {isCommitting ? 'Committing...' : 'Commit Transactions'}
      </button>
    </div>
  );
}

function ReviewStep({
  rows,
  activeRows,
  deletedRows,
  warnRows,
  derivedRows,
  confirmMode,
  canCommit,
  reviewBusy,
  isCommitting,
  isCancelling,
  savingRowId,
  deletingRowId,
  savedRowIds,
  errorMessage,
  onSetConfirmMode,
  onGetDraft,
  onPatch,
  onToggleReviewed,
  onToggleDelete,
  onCommit,
  onCancelJob,
  onClose,
}: Readonly<ReviewStepProps>) {
  return (
    <>
      <ReviewSummaryChips
        activeRows={activeRows}
        deletedRows={deletedRows}
        warnRows={warnRows}
        derivedRows={derivedRows}
      />

      <div className="flex-1 overflow-y-auto">
        <ReviewTableHeader />
        <ReviewRowsList
          rows={rows}
          savingRowId={savingRowId}
          deletingRowId={deletingRowId}
          savedRowIds={savedRowIds}
          onGetDraft={onGetDraft}
          onPatch={onPatch}
          onToggleReviewed={onToggleReviewed}
          onToggleDelete={onToggleDelete}
        />
      </div>

      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
        {confirmMode === 'review-cancel' ? (
          <ReviewCancelConfirm
            isCancelling={isCancelling}
            onSetConfirmMode={onSetConfirmMode}
            onCancelJob={onCancelJob}
            onClose={onClose}
          />
        ) : (
          <ReviewDefaultFooter
            activeRows={activeRows}
            deletedRows={deletedRows}
            warnRows={warnRows}
            canCommit={canCommit}
            reviewBusy={reviewBusy}
            isCommitting={isCommitting}
            onSetConfirmMode={onSetConfirmMode}
            onCommit={onCommit}
            onClose={onClose}
          />
        )}

        {errorMessage && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage}
          </div>
        )}
      </div>
    </>
  );
}

type FailedStepProps = {
  importErrorMessage: string | null;
  errorMessage: string;
  onClose: () => void;
};

function FailedStep({ importErrorMessage, errorMessage, onClose }: Readonly<FailedStepProps>) {
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
          className="flex-1 rounded-xl border border-slate-200 text-slate-600 py-2.5 text-sm hover:bg-white transition-colors font-medium"
        >
          Close
        </button>
      </div>
    </>
  );
}

type UnavailableStepProps = {
  errorMessage: string;
  onClose: () => void;
};

function UnavailableStep({ errorMessage, onClose }: Readonly<UnavailableStepProps>) {
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

type ModalStepContentProps = {
  controller: ReturnType<typeof usePensionImportModalController>;
  pot: PensionPot;
  onClose: () => void;
  displayFileName: string;
};

function ModalStepContent({
  controller,
  pot,
  onClose,
  displayFileName,
}: Readonly<ModalStepContentProps>) {
  if (controller.step === 'upload') {
    return (
      <UploadStep
        file={controller.selectedFile}
        provider={pot.provider}
        potName={pot.name}
        errorMessage={controller.errorMessage}
        isUploading={controller.isUploading}
        onFileChange={controller.handleFileChange}
        onUpload={controller.handleUpload}
        onClose={onClose}
      />
    );
  }

  if (controller.step === 'queued') {
    return (
      <QueuedStep
        fileName={displayFileName}
        jobPhase={controller.jobPhase}
        confirmMode={controller.confirmMode}
        isCancelling={controller.isCancelling}
        errorMessage={controller.errorMessage}
        modelCaption={controller.modelCaption}
        onSetConfirmMode={controller.setConfirmMode}
        onCancelJob={controller.handleCancelJob}
        onClose={onClose}
      />
    );
  }

  if (controller.step === 'review') {
    return (
      <ReviewStep
        rows={controller.rows}
        activeRows={controller.activeRows}
        deletedRows={controller.deletedRows}
        warnRows={controller.warnRows}
        derivedRows={controller.derivedRows}
        confirmMode={controller.confirmMode}
        canCommit={controller.canCommit}
        reviewBusy={controller.reviewBusy}
        isCommitting={controller.isCommitting}
        isCancelling={controller.isCancelling}
        savingRowId={controller.savingRowId}
        deletingRowId={controller.deletingRowId}
        savedRowIds={controller.savedRowIds}
        errorMessage={controller.errorMessage}
        onSetConfirmMode={controller.setConfirmMode}
        onGetDraft={controller.getDraft}
        onPatch={controller.patchDraft}
        onToggleReviewed={controller.handleToggleReviewed}
        onToggleDelete={controller.handleDeleteToggle}
        onCommit={controller.handleCommit}
        onCancelJob={controller.handleCancelJob}
        onClose={onClose}
      />
    );
  }

  if (controller.step === 'failed') {
    return (
      <FailedStep
        importErrorMessage={controller.importQuery.data?.errorMessage ?? null}
        errorMessage={controller.errorMessage}
        onClose={onClose}
      />
    );
  }

  return <UnavailableStep errorMessage={controller.errorMessage} onClose={onClose} />;
}

export function ImportPensionStatementModal({
  pot,
  onClose,
  initialImportId,
}: Readonly<ImportPensionStatementModalProps>) {
  const controller = usePensionImportModalController({
    potId: pot.id,
    initialImportId,
  });
  const reviewLayout = controller.step === 'review';
  const displayFileName = controller.fileName || controller.importQuery.data?.fileName || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col ${
          reviewLayout ? 'max-w-3xl max-h-[90vh]' : 'max-w-lg'
        }`}
      >
        <Header pot={pot} step={controller.step} jobPhase={controller.jobPhase} onClose={onClose} />
        <ModalStepContent
          controller={controller}
          pot={pot}
          onClose={onClose}
          displayFileName={displayFileName}
        />
      </div>
    </div>
  );
}
