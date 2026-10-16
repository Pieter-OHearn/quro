import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CsvColumnMapping,
  CsvImportKind,
  CsvImportMapping,
  CsvImportPreview,
  CsvImportProfile,
  CsvImportProgress,
} from '@quro/shared';
import { apiGet, apiPost, resolveApiErrorMessage } from '@/lib/api';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import { useDomainMutation } from '@/lib/useDomainMutation';

export type CsvDescription = {
  headers: string[];
  delimiter: string;
  rowCount: number;
  sample: string[][];
  suggestion: Partial<CsvColumnMapping>;
};

/** What the preview and the import both send: the file, where it goes and how to read it. */
export type ImportRequest = {
  kind: CsvImportKind;
  accountId?: number;
  csv: string;
  mapping: CsvImportMapping;
  closingBalance?: number;
  closingDate?: string;
};

export type StageRequest = ImportRequest & {
  fileName: string;
  fileSha256: string;
  selectedRows: number[];
  saveProfile: boolean;
};

export function useImportProfiles(kind: CsvImportKind) {
  return useQuery({
    queryKey: queryKeys.imports.profiles(kind),
    queryFn: () => apiGet<CsvImportProfile[]>('/api/imports/profiles', { params: { kind } }),
  });
}

export function useDescribeCsv() {
  return useMutation({
    mutationFn: (csv: string) => apiPost<CsvDescription>('/api/imports/csv/headers', { csv }),
  });
}

export function usePreviewCsv() {
  return useMutation({
    mutationFn: (request: ImportRequest) =>
      apiPost<CsvImportPreview>('/api/imports/csv/preview', request),
  });
}

export function useReconcileImport() {
  return useDomainMutation('csvImport', ({ id, difference }: { id: number; difference: number }) =>
    apiPost<CsvImportProgress>(`/api/imports/csv/${id}/reconcile`, { difference }),
  );
}

export type RunState = {
  phase: 'idle' | 'running' | 'done' | 'failed';
  progress: CsvImportProgress | null;
  error: string | null;
  cancelling: boolean;
};

const IDLE: RunState = { phase: 'idle', progress: null, error: null, cancelling: false };
const RUN_FAILED = 'The import stopped. Rows already written are kept; you can resume it.';

/**
 * Stages the approved rows, then commits them in server-sized batches until none are left. A
 * batch is atomic, so stopping (cancel, a closed tab, a lost connection) never leaves half a
 * batch, and `resume` carries on from the rows still pending.
 */
export function useRunImport() {
  const queryClient = useQueryClient();
  const cancelRequested = useRef(false);
  const [state, setState] = useState<RunState>(IDLE);

  const drive = useCallback(
    async (first: CsvImportProgress) => {
      let progress = first;
      setState({ ...IDLE, phase: 'running', progress });
      while (progress.status === 'staged' && progress.pending > 0) {
        const action = cancelRequested.current ? 'cancel' : 'commit';
        progress = await apiPost<CsvImportProgress>(`/api/imports/csv/${progress.id}/${action}`);
        setState({ ...IDLE, phase: 'running', progress, cancelling: cancelRequested.current });
        if (action === 'cancel') break;
      }
      setState({ ...IDLE, phase: 'done', progress });
    },
    [setState],
  );

  const run = useCallback(
    async (start: () => Promise<CsvImportProgress>, fallback: CsvImportProgress | null) => {
      cancelRequested.current = false;
      try {
        await drive(await start());
      } catch (error) {
        setState((previous) => ({
          ...IDLE,
          phase: 'failed',
          progress: previous.progress ?? fallback,
          error: resolveApiErrorMessage(error, RUN_FAILED),
        }));
      } finally {
        await invalidateDomain(queryClient, 'csvImport');
      }
    },
    [drive, queryClient],
  );

  const start = useCallback(
    (request: StageRequest) =>
      run(() => apiPost<CsvImportProgress>('/api/imports/csv', request), null),
    [run],
  );

  const resume = useCallback(() => {
    const current = state.progress;
    if (current) void run(() => Promise.resolve(current), current);
  }, [run, state.progress]);

  const cancel = useCallback(() => {
    cancelRequested.current = true;
    setState((previous) => ({ ...previous, cancelling: true }));
  }, []);

  return { state, start, resume, cancel };
}
