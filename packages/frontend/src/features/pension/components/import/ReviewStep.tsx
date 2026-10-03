import { cn } from '@/lib/utils';
import type { PensionStatementImportRow } from '@quro/shared';
import { AlertTriangle, Brain, Check, Loader2, Trash2, Undo2, XCircle } from 'lucide-react';
import {
  type PensionImportController,
  type RowDraft,
  type ConfirmMode,
} from '../../hooks/usePensionImportModalController';
import { DataTable, DataTableCell, DataTableRow, getFieldChrome } from '@/components/ui';

type ConfidenceLevel = PensionStatementImportRow['confidenceLabel'];

type TypeMeta = {
  label: string;
};

const TYPE_META: Record<PensionStatementImportRow['type'], TypeMeta> = {
  contribution: { label: 'Contribution' },
  fee: { label: 'Fee' },
  annual_statement: { label: 'Annual Statement' },
};

const CONF_META: Record<ConfidenceLevel, { label: string; cls: string }> = {
  high: { label: 'high', cls: 'bg-success-soft text-success border border-success-border' },
  medium: { label: 'medium', cls: 'bg-warning-soft text-warning border border-warning-border' },
  low: { label: 'low', cls: 'bg-danger-soft text-danger border border-danger-border' },
};

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
    <DataTableRow className="bg-surface-sunken opacity-50">
      <DataTableCell colSpan={6} className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="w-1 flex-shrink-0" />
          <span className="text-xs text-fg-faint line-through flex-1">
            {typeMeta.label} · {draft.amount} · {draft.date}
          </span>
          <button
            type="button"
            onClick={() => {
              void onToggleDelete(row);
            }}
            disabled={isRowBusy}
            className="flex items-center gap-1 text-xs text-brand-accent hover:text-brand-fg transition-colors flex-shrink-0 disabled:opacity-60"
          >
            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />} Undo
          </button>
        </div>
      </DataTableCell>
    </DataTableRow>
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
        className={getFieldChrome({
          paddingClassName: 'px-2 py-1.5',
          className: 'text-xs rounded-lg focus:ring-1 text-fg-strong',
        })}
      >
        <option value="contribution">Contribution</option>
        <option value="fee">Fee</option>
        <option value="annual_statement">Annual Statement</option>
      </select>

      {draft.type === 'contribution' && (
        <button
          type="button"
          onClick={() => onPatch(row, { isEmployer: !(draft.isEmployer ?? false) })}
          className={cn(
            'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
            draft.isEmployer
              ? 'bg-brand-soft border-brand-tint text-brand'
              : 'bg-success-soft border-success-border text-success',
          )}
        >
          {draft.isEmployer ? 'Employer' : 'Employee'}
        </button>
      )}

      {row.isDerived && (
        <span className="inline-flex items-center gap-1 text-[10px] bg-warning-soft text-warning border border-warning-soft-strong px-1.5 py-0.5 rounded-full">
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
        className={getFieldChrome({
          paddingClassName: 'px-2 py-1.5',
          className: 'text-xs rounded-lg focus:ring-1 text-fg-subtle',
        })}
        placeholder="Add note..."
      />
      {row.collisionWarning && (
        <p className="text-[10px] text-warning-fg truncate">{row.collisionWarning.reason}</p>
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
      {row.isDerived && <span className="text-[9px] text-warning-accent font-medium">derived</span>}
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
        className={cn(
          'w-7 h-7 flex items-center justify-center rounded-lg transition-all flex-shrink-0 disabled:opacity-60',
          isSaved
            ? 'bg-success-accent text-fg-inverted shadow-sm shadow-success-soft-strong'
            : 'border border-border-default text-fg-faint hover:border-success-border-strong hover:text-success hover:bg-success-soft',
        )}
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
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-transparent text-fg-disabled hover:border-danger-border hover:text-danger hover:bg-danger-soft transition-all flex-shrink-0 disabled:opacity-60"
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
  const confidenceMeta = CONF_META[row.confidenceLabel];

  return (
    <DataTableRow
      className={cn(
        'border transition-all',
        isSaved
          ? 'border-success-border bg-success-soft/20'
          : 'border-border-subtle hover:border-border-default bg-surface',
      )}
    >
      <DataTableCell columnKey="type">
        <ReviewTypeCell row={row} draft={draft} onPatch={onPatch} />
      </DataTableCell>
      <DataTableCell columnKey="amount">
        <input
          type="number"
          step="0.01"
          value={draft.amount}
          onChange={(event) => onPatch(row, { amount: event.target.value })}
          className={getFieldChrome({
            paddingClassName: 'px-2 py-1.5',
            className: 'text-xs rounded-lg focus:ring-1 text-fg-strong',
          })}
          placeholder="0.00"
        />
      </DataTableCell>
      <DataTableCell columnKey="date">
        <input
          type="date"
          value={draft.date}
          onChange={(event) => onPatch(row, { date: event.target.value })}
          className={getFieldChrome({
            paddingClassName: 'px-2 py-1.5',
            className: 'text-xs rounded-lg focus:ring-1 text-fg-strong',
          })}
        />
      </DataTableCell>
      <DataTableCell columnKey="note">
        <ReviewNoteCell row={row} draft={draft} onPatch={onPatch} />
      </DataTableCell>
      <DataTableCell columnKey="confidence">
        <ReviewConfidenceCell row={row} confidenceMeta={confidenceMeta} />
      </DataTableCell>
      <DataTableCell columnKey="actions">
        <ReviewActionsCell
          row={row}
          isSaved={isSaved}
          isRowBusy={isRowBusy}
          saving={saving}
          deleting={deleting}
          onToggleReviewed={onToggleReviewed}
          onToggleDelete={onToggleDelete}
        />
      </DataTableCell>
    </DataTableRow>
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
    <div className="px-5 pt-4 pb-3 flex-shrink-0 flex items-center gap-2 flex-wrap border-b border-border-subtle">
      <span className="flex items-center gap-1.5 text-xs bg-surface-muted text-fg-muted px-3 py-1.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-success-accent flex-shrink-0" />
        {activeRows.length} active row{activeRows.length !== 1 ? 's' : ''}
      </span>
      {derivedRows.length > 0 && (
        <span className="flex items-center gap-1.5 text-xs bg-brand-soft text-brand border border-brand-soft-strong px-3 py-1.5 rounded-full">
          <Brain size={11} className="flex-shrink-0" />
          {derivedRows.length} AI derived
        </span>
      )}
      {warnRows.length > 0 && (
        <span className="flex items-center gap-1.5 text-xs bg-warning-soft text-warning-fg border border-warning-soft-strong px-3 py-1.5 rounded-full">
          <AlertTriangle size={11} className="flex-shrink-0" />
          {warnRows.length} need{warnRows.length === 1 ? 's' : ''} review
        </span>
      )}
      {deletedRows.length > 0 && (
        <span className="flex items-center gap-1.5 text-xs bg-surface-muted text-fg-faint px-3 py-1.5 rounded-full ml-auto">
          {deletedRows.length} removed
        </span>
      )}
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
    <DataTable
      variant="plain"
      density="compact"
      tableVariant="editable"
      columns={[
        {
          key: 'type',
          header: 'Type',
          mobileLabel: 'Type',
          width: 130,
          cellClassName: 'px-3 py-3',
        },
        {
          key: 'amount',
          header: 'Amount',
          mobileLabel: 'Amount',
          width: 86,
          numeric: true,
          cellClassName: 'px-3 py-3',
        },
        {
          key: 'date',
          header: 'Date',
          mobileLabel: 'Date',
          width: 112,
          cellClassName: 'px-3 py-3',
        },
        { key: 'note', header: 'Note', mobileLabel: 'Note', cellClassName: 'px-3 py-3' },
        {
          key: 'confidence',
          header: 'Confidence',
          align: 'center',
          mobileLabel: 'Confidence',
          width: 100,
          cellClassName: 'px-3 py-3',
        },
        {
          key: 'actions',
          header: 'Actions',
          align: 'right',
          mobileLabel: 'Actions',
          priority: 'actions',
          width: 84,
          cellClassName: 'px-3 py-3',
        },
      ]}
      tableLayout="fixed"
      minWidth={760}
      className="px-5 py-3"
      bodyClassName="rounded-xl border border-border-subtle"
    >
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
    </DataTable>
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
    <div className="bg-danger-soft border border-danger-border rounded-xl px-4 py-3 space-y-3">
      <div className="flex items-start gap-2.5">
        <XCircle size={14} className="text-danger mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-danger-fg">Discard this import?</p>
          <p className="text-[11px] text-danger mt-0.5 leading-relaxed">
            All staged transactions will be discarded and the job will be removed from your
            notification list. Nothing will be added to your ledger.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSetConfirmMode('none')}
          className="flex-1 rounded-xl border border-border-default bg-surface text-fg-muted py-2 text-xs hover:bg-surface-sunken transition-colors font-medium"
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
          className="flex-1 rounded-xl bg-danger-hover hover:bg-danger-fg text-fg-inverted py-2 text-xs transition-colors font-medium flex items-center justify-center gap-1.5 disabled:opacity-70"
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
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onSetConfirmMode('review-cancel')}
          className="flex items-center gap-1.5 px-4 rounded-xl border border-danger-border text-danger py-2.5 text-sm hover:bg-danger-soft transition-colors font-medium whitespace-nowrap"
        >
          <XCircle size={14} />
          Cancel Job
        </button>
        <p className="text-xs text-fg-subtle hidden sm:block">
          <span className="font-semibold text-fg-strong">{activeRows.length}</span> transaction
          {activeRows.length !== 1 ? 's' : ''} to commit
          {deletedRows.length > 0 && (
            <span className="text-fg-faint ml-1.5">· {deletedRows.length} removed</span>
          )}
          {warnRows.length > 0 && (
            <span className="text-warning-accent ml-1.5">· {warnRows.length} flagged</span>
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
        className="px-6 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-fg-inverted py-2.5 text-sm transition-colors font-medium shadow-sm shadow-brand-tint whitespace-nowrap"
      >
        {isCommitting ? 'Committing...' : 'Commit Transactions'}
      </button>
    </div>
  );
}

export function ReviewStep({
  controller,
  onClose,
}: Readonly<{ controller: PensionImportController; onClose: () => void }>) {
  const {
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
    setConfirmMode: onSetConfirmMode,
    getDraft: onGetDraft,
    patchDraft: onPatch,
    handleToggleReviewed: onToggleReviewed,
    handleDeleteToggle: onToggleDelete,
    handleCommit: onCommit,
    handleCancelJob: onCancelJob,
  } = controller;
  return (
    <>
      <ReviewSummaryChips
        activeRows={activeRows}
        deletedRows={deletedRows}
        warnRows={warnRows}
        derivedRows={derivedRows}
      />

      <div className="flex-1 overflow-y-auto">
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

      <div className="px-6 py-4 bg-surface-sunken border-t border-border-subtle flex-shrink-0">
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
          <div className="mt-3 rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger-fg">
            {errorMessage}
          </div>
        )}
      </div>
    </>
  );
}
