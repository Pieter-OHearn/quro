import { useEffect, useMemo, useRef, useState } from 'react';
import type { PensionImportStatus, PensionStatementImportRow } from '@quro/shared';
import { useCancelPensionStatementImport } from './useCancelPensionStatementImport';
import { useCommitPensionStatementImport } from './useCommitPensionStatementImport';
import { useCreatePensionStatementImport } from './useCreatePensionStatementImport';
import { useDeletePensionStatementImportRow } from './useDeletePensionStatementImportRow';
import { usePensionStatementImport } from './usePensionStatementImport';
import { usePensionStatementImportRows } from './usePensionStatementImportRows';
import { useRestorePensionStatementImportRow } from './useRestorePensionStatementImportRow';
import { useUpdatePensionStatementImportRow } from './useUpdatePensionStatementImportRow';
import type { UpdatePensionImportRowPayload } from '../types';

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;

type RowDraft = {
  type: PensionStatementImportRow['type'];
  amount: string;
  taxAmount: string;
  date: string;
  note: string;
  isEmployer: boolean | null;
};

type ModalState = {
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  importId: number | null;
  setImportId: (id: number | null) => void;
  errorMessage: string;
  setErrorMessage: (value: string) => void;
  confirmMode: ConfirmMode;
  setConfirmMode: (mode: ConfirmMode) => void;
  drafts: Record<number, RowDraft>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<number, RowDraft>>>;
};

export type PensionImportModalStep = 'upload' | 'queued' | 'review' | 'failed' | 'unavailable';
export type JobPhase = 'queuing' | 'processing' | 'ready';
export type ConfirmMode = 'none' | 'queued-cancel' | 'review-cancel';

type UsePensionImportModalControllerInput = {
  potId: number;
  initialImportId?: number | null;
};

type UsePensionImportModalControllerResult = {
  step: PensionImportModalStep;
  selectedFile: File | null;
  fileName: string;
  importId: number | null;
  status: PensionImportStatus | null;
  errorMessage: string;
  confirmMode: ConfirmMode;
  setConfirmMode: (mode: ConfirmMode) => void;
  importQuery: ReturnType<typeof usePensionStatementImport>;
  rowsQuery: ReturnType<typeof usePensionStatementImportRows>;
  rows: PensionStatementImportRow[];
  activeRows: PensionStatementImportRow[];
  deletedRows: PensionStatementImportRow[];
  warnRows: PensionStatementImportRow[];
  derivedRows: PensionStatementImportRow[];
  canCommit: boolean;
  reviewBusy: boolean;
  isUploading: boolean;
  isCancelling: boolean;
  isCommitting: boolean;
  savingRowId: number | null;
  deletingRowId: number | null;
  savedRowIds: Set<number>;
  jobPhase: JobPhase;
  modelCaption: string | null;
  handleFileChange: (file: File | null) => void;
  handleUpload: () => Promise<void>;
  patchDraft: (row: PensionStatementImportRow, changes: Partial<RowDraft>) => void;
  getDraft: (row: PensionStatementImportRow) => RowDraft;
  handleToggleReviewed: (row: PensionStatementImportRow) => void;
  handleDeleteToggle: (row: PensionStatementImportRow) => Promise<void>;
  handleCommit: () => Promise<boolean>;
  handleCancelJob: () => Promise<boolean>;
};

function readApiError(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const responseError = (error as { response?: { data?: { error?: unknown } } }).response?.data
    ?.error;
  return typeof responseError === 'string' ? responseError : null;
}

function parseNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDraft(row: PensionStatementImportRow): RowDraft {
  return {
    type: row.type,
    amount: String(row.amount),
    taxAmount: String(row.taxAmount),
    date: row.date,
    note: row.note,
    isEmployer: row.isEmployer,
  };
}

function validateUploadFile(file: File | null): string {
  if (!file) return 'A PDF file is required';
  const mimeAllowed = file.type === 'application/pdf' || file.type === '';
  if (!file.name.toLowerCase().endsWith('.pdf') || !mimeAllowed)
    return 'Only PDF files are allowed';
  if (file.size <= 0) return 'Uploaded file is empty';
  if (file.size > MAX_PDF_SIZE_BYTES) return 'PDF exceeds 20MB limit';
  return '';
}

function buildRowPayload(draft: RowDraft): UpdatePensionImportRowPayload {
  return {
    type: draft.type,
    amount: parseNumber(draft.amount),
    taxAmount: parseNumber(draft.taxAmount),
    date: draft.date,
    note: draft.note,
    isEmployer: draft.type === 'contribution' ? draft.isEmployer : null,
  };
}

function toStep(params: {
  importId: number | null;
  status: PensionImportStatus | null;
  isImportLoading: boolean;
  isImportError: boolean;
}): PensionImportModalStep {
  if (params.importId === null) return 'upload';
  if (params.isImportError) return 'unavailable';
  if (params.isImportLoading || params.status === 'queued' || params.status === 'processing') {
    return 'queued';
  }
  if (params.status === 'ready_for_review' || params.status === 'committed') return 'review';
  if (params.status === 'failed') return 'failed';
  return 'unavailable';
}

function toJobPhase(status: PensionImportStatus | null): JobPhase {
  if (status === 'processing') return 'processing';
  if (status === 'ready_for_review' || status === 'committed') return 'ready';
  return 'queuing';
}

function useImportModalState(potId: number, initialImportId?: number | null): ModalState {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<number | null>(initialImportId ?? null);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>('none');
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const resetRef = useRef({ potId, initialImportId: initialImportId ?? null });

  useEffect(() => {
    const next = { potId, initialImportId: initialImportId ?? null };
    if (
      resetRef.current.potId === next.potId &&
      resetRef.current.initialImportId === next.initialImportId
    ) {
      return;
    }

    resetRef.current = next;
    setSelectedFile(null);
    setImportId(next.initialImportId);
    setErrorMessage('');
    setConfirmMode('none');
    setDrafts({});
  }, [initialImportId, potId]);

  return {
    selectedFile,
    setSelectedFile,
    importId,
    setImportId,
    errorMessage,
    setErrorMessage,
    confirmMode,
    setConfirmMode,
    drafts,
    setDrafts,
  };
}

function useRowsSummary(rows: PensionStatementImportRow[]) {
  const activeRows = useMemo(() => rows.filter((row) => !row.isDeleted), [rows]);
  const deletedRows = useMemo(() => rows.filter((row) => row.isDeleted), [rows]);
  const derivedRows = useMemo(() => rows.filter((row) => row.isDerived), [rows]);
  const annualRows = useMemo(
    () => activeRows.filter((row) => row.type === 'annual_statement'),
    [activeRows],
  );
  const warnRows = useMemo(
    () =>
      activeRows.filter((row) => row.confidenceLabel !== 'high' || row.collisionWarning !== null),
    [activeRows],
  );

  return { activeRows, deletedRows, derivedRows, annualRows, warnRows };
}

type UseRowDraftActionsInput = {
  importId: number | null;
  drafts: Record<number, RowDraft>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<number, RowDraft>>>;
  setErrorMessage: (value: string) => void;
  updateRow: ReturnType<typeof useUpdatePensionStatementImportRow>;
  deleteRow: ReturnType<typeof useDeletePensionStatementImportRow>;
  restoreRow: ReturnType<typeof useRestorePensionStatementImportRow>;
};

function useRowDraftActions({
  importId,
  drafts,
  setDrafts,
  setErrorMessage,
  updateRow,
  deleteRow,
  restoreRow,
}: UseRowDraftActionsInput) {
  const [savingRowId, setSavingRowId] = useState<number | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<number | null>(null);
  const [savedRowIds, setSavedRowIds] = useState<Set<number>>(new Set<number>());

  const getDraft = (row: PensionStatementImportRow): RowDraft => drafts[row.id] ?? toDraft(row);

  const clearSavedRow = (rowId: number): void => {
    setSavedRowIds((current) => {
      const next = new Set(current);
      next.delete(rowId);
      return next;
    });
  };

  const patchDraft = (row: PensionStatementImportRow, changes: Partial<RowDraft>): void => {
    setDrafts((current) => ({
      ...current,
      [row.id]: { ...(current[row.id] ?? toDraft(row)), ...changes },
    }));
    clearSavedRow(row.id);
  };

  const saveRow = async (row: PensionStatementImportRow): Promise<void> => {
    if (!importId) return;

    setSavingRowId(row.id);
    try {
      await updateRow.mutateAsync({
        importId,
        rowId: row.id,
        payload: buildRowPayload(getDraft(row)),
      });
      setSavedRowIds((current) => new Set(current).add(row.id));
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(readApiError(error) ?? 'Failed to save row changes');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleToggleReviewed = (row: PensionStatementImportRow): void => {
    if (savedRowIds.has(row.id)) {
      clearSavedRow(row.id);
      return;
    }
    void saveRow(row);
  };

  const handleDeleteToggle = async (row: PensionStatementImportRow): Promise<void> => {
    if (!importId) return;

    setDeletingRowId(row.id);
    try {
      if (row.isDeleted) await restoreRow.mutateAsync({ importId, rowId: row.id });
      else await deleteRow.mutateAsync({ importId, rowId: row.id });
      clearSavedRow(row.id);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(readApiError(error) ?? 'Failed to update row');
    } finally {
      setDeletingRowId(null);
    }
  };

  return {
    getDraft,
    patchDraft,
    handleToggleReviewed,
    handleDeleteToggle,
    savingRowId,
    deletingRowId,
    savedRowIds,
  };
}

type UseImportActionsInput = {
  potId: number;
  selectedFile: File | null;
  importId: number | null;
  canCommit: boolean;
  status: PensionImportStatus | null;
  createImport: ReturnType<typeof useCreatePensionStatementImport>;
  commitImport: ReturnType<typeof useCommitPensionStatementImport>;
  cancelImport: ReturnType<typeof useCancelPensionStatementImport>;
  setSelectedFile: (file: File | null) => void;
  setImportId: (id: number | null) => void;
  setErrorMessage: (value: string) => void;
  setConfirmMode: (mode: ConfirmMode) => void;
};

function useImportActions({
  potId,
  selectedFile,
  importId,
  canCommit,
  status,
  createImport,
  commitImport,
  cancelImport,
  setSelectedFile,
  setImportId,
  setErrorMessage,
  setConfirmMode,
}: UseImportActionsInput) {
  const handleFileChange = (file: File | null): void => {
    setSelectedFile(file);
    setErrorMessage('');
  };

  const handleUpload = async (): Promise<void> => {
    const validationError = validateUploadFile(selectedFile);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    try {
      const created = await createImport.mutateAsync({ potId, file: selectedFile! });
      setImportId(created.id);
      setErrorMessage('');
      setConfirmMode('none');
    } catch (error) {
      setErrorMessage(readApiError(error) ?? 'Failed to create statement import');
    }
  };

  const handleCommit = async (): Promise<boolean> => {
    if (!importId || !canCommit) return false;
    try {
      await commitImport.mutateAsync(importId);
      return true;
    } catch (error) {
      setErrorMessage(readApiError(error) ?? 'Failed to commit import');
      return false;
    }
  };

  const handleCancelJob = async (): Promise<boolean> => {
    if (!importId || status === 'committed') return true;
    try {
      await cancelImport.mutateAsync(importId);
      return true;
    } catch (error) {
      setErrorMessage(readApiError(error) ?? 'Failed to cancel import');
      return false;
    }
  };

  return { handleFileChange, handleUpload, handleCommit, handleCancelJob };
}

type ImportModalData = {
  status: PensionImportStatus | null;
  importQuery: ReturnType<typeof usePensionStatementImport>;
  rowsQuery: ReturnType<typeof usePensionStatementImportRows>;
  rows: PensionStatementImportRow[];
  rowsSummary: ReturnType<typeof useRowsSummary>;
  step: PensionImportModalStep;
  jobPhase: JobPhase;
};

function useImportModalData(importId: number | null): ImportModalData {
  const importQuery = usePensionStatementImport(importId);
  const status = importQuery.data?.status ?? null;
  const rowsQuery = usePensionStatementImportRows(importId, status);
  const rows = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);
  const rowsSummary = useRowsSummary(rows);
  const step = toStep({
    importId,
    status,
    isImportLoading: importQuery.isLoading,
    isImportError: importQuery.isError,
  });
  const jobPhase = toJobPhase(status);

  return { status, importQuery, rowsQuery, rows, rowsSummary, step, jobPhase };
}

function canCommitImport(params: {
  status: PensionImportStatus | null;
  activeRowsCount: number;
  annualRowsCount: number;
  isCommitting: boolean;
}): boolean {
  return (
    params.status === 'ready_for_review' &&
    params.activeRowsCount > 0 &&
    params.annualRowsCount === 1 &&
    !params.isCommitting
  );
}

function isReviewBusy(states: boolean[]): boolean {
  return states.some(Boolean);
}

function buildModelCaption(
  data: ReturnType<typeof usePensionStatementImport>['data'] | undefined,
): string | null {
  if (!data?.modelName) return null;
  if (!data.modelVersion) return data.modelName;
  return `${data.modelName} (${data.modelVersion})`;
}

function buildControllerResult(params: {
  modalState: ModalState;
  data: ImportModalData;
  rowActions: ReturnType<typeof useRowDraftActions>;
  importActions: ReturnType<typeof useImportActions>;
  isUploading: boolean;
  isCancelling: boolean;
  isCommitting: boolean;
  canCommit: boolean;
  reviewBusy: boolean;
}): UsePensionImportModalControllerResult {
  return {
    step: params.data.step,
    selectedFile: params.modalState.selectedFile,
    fileName: params.modalState.selectedFile?.name ?? '',
    importId: params.modalState.importId,
    status: params.data.status,
    errorMessage: params.modalState.errorMessage,
    confirmMode: params.modalState.confirmMode,
    setConfirmMode: params.modalState.setConfirmMode,
    importQuery: params.data.importQuery,
    rowsQuery: params.data.rowsQuery,
    rows: params.data.rows,
    activeRows: params.data.rowsSummary.activeRows,
    deletedRows: params.data.rowsSummary.deletedRows,
    warnRows: params.data.rowsSummary.warnRows,
    derivedRows: params.data.rowsSummary.derivedRows,
    canCommit: params.canCommit,
    reviewBusy: params.reviewBusy,
    isUploading: params.isUploading,
    isCancelling: params.isCancelling,
    isCommitting: params.isCommitting,
    savingRowId: params.rowActions.savingRowId,
    deletingRowId: params.rowActions.deletingRowId,
    savedRowIds: params.rowActions.savedRowIds,
    jobPhase: params.data.jobPhase,
    modelCaption: buildModelCaption(params.data.importQuery.data),
    handleFileChange: params.importActions.handleFileChange,
    handleUpload: params.importActions.handleUpload,
    patchDraft: params.rowActions.patchDraft,
    getDraft: params.rowActions.getDraft,
    handleToggleReviewed: params.rowActions.handleToggleReviewed,
    handleDeleteToggle: params.rowActions.handleDeleteToggle,
    handleCommit: params.importActions.handleCommit,
    handleCancelJob: params.importActions.handleCancelJob,
  };
}

export function usePensionImportModalController({
  potId,
  initialImportId,
}: UsePensionImportModalControllerInput): UsePensionImportModalControllerResult {
  const modalState = useImportModalState(potId, initialImportId);
  const createImport = useCreatePensionStatementImport();
  const cancelImport = useCancelPensionStatementImport();
  const commitImport = useCommitPensionStatementImport();
  const updateRow = useUpdatePensionStatementImportRow();
  const deleteRow = useDeletePensionStatementImportRow();
  const restoreRow = useRestorePensionStatementImportRow();
  const data = useImportModalData(modalState.importId);
  const canCommit = canCommitImport({
    status: data.status,
    activeRowsCount: data.rowsSummary.activeRows.length,
    annualRowsCount: data.rowsSummary.annualRows.length,
    isCommitting: commitImport.isPending,
  });
  const reviewBusy = isReviewBusy([
    data.importQuery.isFetching,
    data.rowsQuery.isFetching,
    updateRow.isPending,
    deleteRow.isPending,
    restoreRow.isPending,
    commitImport.isPending,
    cancelImport.isPending,
  ]);

  const rowActions = useRowDraftActions({
    importId: modalState.importId,
    drafts: modalState.drafts,
    setDrafts: modalState.setDrafts,
    setErrorMessage: modalState.setErrorMessage,
    updateRow,
    deleteRow,
    restoreRow,
  });

  const importActions = useImportActions({
    potId,
    selectedFile: modalState.selectedFile,
    importId: modalState.importId,
    canCommit,
    status: data.status,
    createImport,
    commitImport,
    cancelImport,
    setSelectedFile: modalState.setSelectedFile,
    setImportId: modalState.setImportId,
    setErrorMessage: modalState.setErrorMessage,
    setConfirmMode: modalState.setConfirmMode,
  });

  return buildControllerResult({
    modalState,
    data,
    rowActions,
    importActions,
    isUploading: createImport.isPending,
    isCancelling: cancelImport.isPending,
    isCommitting: commitImport.isPending,
    canCommit,
    reviewBusy,
  });
}
