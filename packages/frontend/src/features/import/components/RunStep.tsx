import { CheckCircle2 } from 'lucide-react';
import type { CsvImportProgress } from '@quro/shared';
import { Button, ProgressMeter } from '@/components/ui';
import { resolveApiErrorMessage } from '@/lib/api';
import { useReconcileImport, type RunState } from '../hooks';
import { ReconciliationCard } from './ReconciliationCard';

type Props = {
  state: RunState;
  currency: string;
  onCancel: () => void;
  onResume: () => void;
};

function counts(progress: CsvImportProgress): string {
  const parts = [
    `${progress.committed} imported`,
    progress.duplicate > 0 ? `${progress.duplicate} already there` : null,
    progress.failed > 0 ? `${progress.failed} could not be imported` : null,
    progress.pending > 0 && progress.status !== 'cancelled' ? `${progress.pending} to go` : null,
    progress.pending > 0 && progress.status === 'cancelled'
      ? `${progress.pending} not imported`
      : null,
  ];
  return parts.filter(Boolean).join(', ');
}

function Running({ state, onCancel }: Readonly<Pick<Props, 'state' | 'onCancel'>>) {
  const { progress } = state;
  const done = progress ? progress.total - progress.pending : 0;
  return (
    <div className="space-y-3">
      <p className="text-cell text-fg-muted" role="status">
        {progress ? counts(progress) : 'Preparing the import'}
      </p>
      <ProgressMeter label="Import progress" value={done} max={progress?.total ?? 1} />
      <Button variant="secondary" disabled={state.cancelling} onClick={onCancel}>
        {state.cancelling ? 'Stopping after this batch' : 'Cancel the import'}
      </Button>
    </div>
  );
}

function Finished({
  progress,
  currency,
}: Readonly<{ progress: CsvImportProgress; currency: string }>) {
  const reconcile = useReconcileImport();
  const { reconciliation } = progress;
  const cancelled = progress.status === 'cancelled';
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-cell text-fg" role="status">
        <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
        {cancelled ? 'The import was cancelled.' : 'The import is finished.'} {counts(progress)}.
      </p>
      {cancelled ? (
        <p className="text-caption text-fg-subtle">
          Rows already imported stay in your ledger and are marked with this import.
        </p>
      ) : null}
      {reconciliation ? (
        <ReconciliationCard
          reconciliation={reconciliation}
          currency={currency}
          adjusting={reconcile.isPending}
          onAdjust={(difference) => reconcile.mutate({ id: progress.id, difference })}
        />
      ) : null}
      {reconcile.error ? (
        <p role="alert" className="text-caption text-danger">
          {resolveApiErrorMessage(reconcile.error, 'The adjustment could not be booked.')}
        </p>
      ) : null}
    </div>
  );
}

export function RunStep({ state, currency, onCancel, onResume }: Readonly<Props>) {
  if (state.phase === 'done' && state.progress) {
    return <Finished progress={state.progress} currency={currency} />;
  }
  if (state.phase === 'failed') {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-cell text-danger">
          {state.error}
        </p>
        {state.progress ? (
          <p className="text-cell text-fg-muted">{counts(state.progress)}.</p>
        ) : null}
        {state.progress ? <Button onClick={onResume}>Resume the import</Button> : null}
      </div>
    );
  }
  return <Running state={state} onCancel={onCancel} />;
}
