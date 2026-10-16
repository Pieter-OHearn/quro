import { cn } from '@/lib/utils';
import type { PensionStatementImportRow } from '@quro/shared';
import { AlertTriangle, Brain, Check, Loader2, Trash2, Undo2, XCircle } from 'lucide-react';
import {
  type PensionImportController,
  type RowDraft,
  type ConfirmMode,
} from '../../hooks/usePensionImportModalController';
import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  IconButton,
  RowActions,
  getFieldChrome,
  type DataTableColumn,
} from '@/components/ui';
import { ImportNotice } from './ImportChrome';

type ConfidenceLevel = PensionStatementImportRow['confidenceLabel'];

type TypeMeta = {
  label: string;
};

const TYPE_META: Record<PensionStatementImportRow['type'], TypeMeta> = {
  contribution: { label: 'Contribution' },
  fee: { label: 'Fee' },
  annual_statement: { label: 'Annual statement' },
};

const CONF_META: Record<ConfidenceLevel, { label: string; tone: 'success' | 'warning' }> = {
  high: { label: 'high', tone: 'success' },
  medium: { label: 'medium', tone: 'warning' },
  low: { label: 'low', tone: 'warning' },
};

// Fields inside the review table are 28px on desktop, like every control in a table.
const TABLE_FIELD_CLASS_NAME = 'h-7 text-fg';

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
    <DataTableRow className="bg-surface-sunken">
      <DataTableCell colSpan={6}>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-caption text-fg-subtle line-through">
            {typeMeta.label} · {draft.amount} · {draft.date}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void onToggleDelete(row);
            }}
            disabled={isRowBusy}
            loading={deleting}
            leadingIcon={<Undo2 size={12} aria-hidden />}
          >
            Undo
          </Button>
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
    <div className="min-w-0 space-y-1">
      <select
        value={draft.type}
        onChange={(event) => {
          const nextType = event.target.value as PensionStatementImportRow['type'];
          onPatch(row, {
            type: nextType,
            isEmployer: nextType === 'contribution' ? (draft.isEmployer ?? false) : null,
          });
        }}
        className={getFieldChrome({ className: TABLE_FIELD_CLASS_NAME })}
      >
        <option value="contribution">Contribution</option>
        <option value="fee">Fee</option>
        <option value="annual_statement">Annual statement</option>
      </select>

      <div className="flex flex-wrap gap-1">
        {draft.type === 'contribution' && (
          <button
            type="button"
            aria-pressed={draft.isEmployer ?? false}
            onClick={() => onPatch(row, { isEmployer: !(draft.isEmployer ?? false) })}
            className={cn(
              'inline-flex items-center rounded-sm border px-1.5 py-px text-[11px] leading-4 font-medium max-sm:min-h-11 max-sm:px-3 max-sm:text-cell transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
              draft.isEmployer
                ? 'border-brand bg-brand-soft text-brand-fg'
                : 'border-border-control text-fg-muted hover:bg-surface-muted active:bg-surface-muted',
            )}
          >
            {draft.isEmployer ? 'Employer' : 'Employee'}
          </button>
        )}
        {row.isDerived && (
          <Badge tone="warning" size="xs">
            <Brain size={10} aria-hidden /> Derived
          </Badge>
        )}
      </div>
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
        className={getFieldChrome({ className: TABLE_FIELD_CLASS_NAME })}
        placeholder="Add note..."
      />
      {row.collisionWarning && (
        <p className="truncate text-caption text-warning">{row.collisionWarning.reason}</p>
      )}
    </div>
  );
}

function ReviewConfidenceCell({
  row,
  confidenceMeta,
}: Readonly<{
  row: PensionStatementImportRow;
  confidenceMeta: (typeof CONF_META)[ConfidenceLevel];
}>) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Badge tone={confidenceMeta.tone}>{confidenceMeta.label}</Badge>
      {row.isDerived && <span className="text-caption text-fg-subtle">derived</span>}
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
    <RowActions className="justify-end">
      <IconButton
        onClick={() => onToggleReviewed(row)}
        disabled={isRowBusy}
        icon={saving ? Loader2 : Check}
        iconClassName={saving ? 'animate-spin' : undefined}
        label={isSaved ? 'Reviewed' : 'Mark as reviewed'}
        title={isSaved ? 'Reviewed' : 'Mark as reviewed'}
        aria-pressed={isSaved}
        size="sm"
        variant="subtle"
        className={isSaved ? 'bg-success-soft text-success hover:text-success' : undefined}
      />
      <IconButton
        onClick={() => {
          void onToggleDelete(row);
        }}
        disabled={isRowBusy}
        icon={deleting ? Loader2 : Trash2}
        iconClassName={deleting ? 'animate-spin' : undefined}
        label="Remove row"
        title="Remove row"
        size="sm"
        variant="danger"
      />
    </RowActions>
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
    <DataTableRow>
      <DataTableCell columnKey="type">
        <ReviewTypeCell row={row} draft={draft} onPatch={onPatch} />
      </DataTableCell>
      <DataTableCell columnKey="amount">
        <input
          type="number"
          step="0.01"
          value={draft.amount}
          onChange={(event) => onPatch(row, { amount: event.target.value })}
          className={getFieldChrome({ className: cn(TABLE_FIELD_CLASS_NAME, 'font-numeric') })}
          placeholder="0.00"
        />
      </DataTableCell>
      <DataTableCell columnKey="date">
        <input
          type="date"
          value={draft.date}
          onChange={(event) => onPatch(row, { date: event.target.value })}
          className={getFieldChrome({ className: cn(TABLE_FIELD_CLASS_NAME, 'font-numeric') })}
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
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-default px-4 py-2">
      <Badge size="md">
        {activeRows.length} active row{activeRows.length !== 1 ? 's' : ''}
      </Badge>
      {derivedRows.length > 0 && (
        <Badge size="md">
          <Brain size={12} aria-hidden />
          {derivedRows.length} derived
        </Badge>
      )}
      {warnRows.length > 0 && (
        <Badge size="md" tone="warning">
          <AlertTriangle size={12} aria-hidden />
          {warnRows.length} need{warnRows.length === 1 ? 's' : ''} review
        </Badge>
      )}
      {deletedRows.length > 0 && (
        <Badge size="md" className="ml-auto">
          {deletedRows.length} removed
        </Badge>
      )}
    </div>
  );
}

const REVIEW_COLUMNS: readonly DataTableColumn[] = [
  { key: 'type', header: 'Type', width: 140 },
  { key: 'amount', header: 'Amount', width: 96, numeric: true },
  { key: 'date', header: 'Date', width: 132 },
  { key: 'note', header: 'Note' },
  { key: 'confidence', header: 'Confidence', align: 'center', width: 96 },
  { key: 'actions', header: 'Actions', align: 'right', priority: 'actions', width: 76 },
];

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
      columns={REVIEW_COLUMNS}
      tableLayout="fixed"
      minWidth={760}
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
    <div className="space-y-2">
      <ImportNotice tone="danger" className="flex items-start gap-2">
        <XCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">Discard this import?</p>
          <p className="text-caption">
            All staged transactions will be discarded and the job will be removed from your
            notification list. Nothing will be added to your ledger.
          </p>
        </div>
      </ImportNotice>
      <div className="flex justify-end gap-2 max-sm:flex-wrap max-sm:*:h-11 max-sm:*:min-w-[calc(50%-0.25rem)] max-sm:*:flex-1">
        <Button variant="secondary" onClick={() => onSetConfirmMode('none')}>
          Keep reviewing
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
          Discard &amp; cancel
        </Button>
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
    <div className="flex items-center justify-between gap-2 sm:gap-4">
      <div className="flex items-center gap-3 max-sm:flex-1 max-sm:*:w-full">
        <Button
          variant="danger"
          onClick={() => onSetConfirmMode('review-cancel')}
          leadingIcon={<XCircle size={14} aria-hidden />}
          className="whitespace-nowrap"
        >
          Cancel job
        </Button>
        <p className="hidden text-caption text-fg-subtle sm:block">
          <span className="font-numeric font-medium text-fg">{activeRows.length}</span> transaction
          {activeRows.length !== 1 ? 's' : ''} to commit
          {deletedRows.length > 0 && <span className="ml-1.5">· {deletedRows.length} removed</span>}
          {warnRows.length > 0 && (
            <span className="ml-1.5 text-warning">· {warnRows.length} flagged</span>
          )}
        </p>
      </div>
      <Button
        onClick={() => {
          void (async () => {
            const committed = await onCommit();
            if (committed) onClose();
          })();
        }}
        disabled={!canCommit || reviewBusy}
        className="whitespace-nowrap max-sm:h-11 max-sm:flex-1"
      >
        {isCommitting ? 'Committing...' : 'Commit transactions'}
      </Button>
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

      <div className="shrink-0 border-t border-border-default bg-surface-sunken px-4 py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
          <ImportNotice tone="danger" className="mt-2">
            {errorMessage}
          </ImportNotice>
        )}
      </div>
    </>
  );
}
