import { invalidateDomain, invalidatePensionImport } from '@/lib/queryInvalidation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiPost, apiDelete, apiPatch } from '@/lib/api';
import { useDomainMutation } from '@/lib/useDomainMutation';
import type {
  PensionPot,
  PensionStatementImport,
  PensionTransaction,
  PensionStatementImportRow,
} from '@quro/shared';
import {
  normalizePensionTransaction,
  normalizePensionStatementImportRow,
  normalizePensionStatementDocument,
} from '../utils/pension-api-normalizers';
import type {
  ApiPensionStatementImport,
  ApiPensionTransaction,
  ApiPensionStatementImportRow,
  UpdatePensionImportRowPayload,
  ApiPensionStatementDocument,
} from '../types';

export function useCancelPensionStatementImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (importId: number): Promise<void> => {
      await api.delete(`/api/pensions/imports/${importId}`);
    },
    onSuccess: (_data, importId) => invalidatePensionImport(queryClient, importId),
  });
}

type CommitPensionStatementImportResponse = {
  import: PensionStatementImport;
  transactionIds: number[];
};

export function useCommitPensionStatementImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (importId: number): Promise<CommitPensionStatementImportResponse> => {
      const payload = await apiPost<CommitPensionStatementImportResponse>(
        `/api/pensions/imports/${importId}/commit`,
      );
      return payload;
    },
    onSuccess: async (_data, importId) => {
      await Promise.all([
        invalidateDomain(queryClient, 'pensionTransaction'),
        invalidatePensionImport(queryClient, importId),
      ]);
    },
  });
}

export function useCreatePensionPot() {
  return useDomainMutation('pension', async (pot: Omit<PensionPot, 'id'>) => {
    const payload = await apiPost<PensionPot>('/api/pensions/pots', pot);
    return payload;
  });
}

type CreatePensionStatementImportInput = {
  potId: number;
  file: File;
};

export function useCreatePensionStatementImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: CreatePensionStatementImportInput,
    ): Promise<PensionStatementImport> => {
      const formData = new FormData();
      formData.set('potId', String(input.potId));
      formData.set('file', input.file);
      const payload = await apiPost<ApiPensionStatementImport>('/api/pensions/imports', formData);
      return payload;
    },
    onSuccess: (createdImport) => invalidatePensionImport(queryClient, createdImport.id),
  });
}

export function useCreatePensionTransaction() {
  return useDomainMutation('pensionTransaction', async (txn: Omit<PensionTransaction, 'id'>) => {
    const payload = await apiPost<ApiPensionTransaction>('/api/pensions/transactions', txn);
    return normalizePensionTransaction(payload);
  });
}

export type DeletePensionPotMode = 'preserveTransactions' | 'deleteTransactions';

type DeletePensionPotInput = {
  id: number;
  mode?: DeletePensionPotMode;
};

export function useDeletePensionPot() {
  return useDomainMutation(
    'pension',
    async ({ id, mode = 'preserveTransactions' }: DeletePensionPotInput) => {
      await api.delete(`/api/pensions/pots/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
  );
}

export function useUnarchivePensionPot() {
  return useDomainMutation('pension', async (id: number) => {
    await api.post(`/api/pensions/pots/${id}/unarchive`);
  });
}

export function useDeletePensionStatementDocument() {
  return useDomainMutation('pensionDocument', async (transactionId: number) => {
    await api.delete(`/api/pensions/transactions/${transactionId}/document`);
  });
}

type DeletePensionStatementImportRowInput = {
  importId: number;
  rowId: number;
};

export function useDeletePensionStatementImportRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: DeletePensionStatementImportRowInput,
    ): Promise<PensionStatementImportRow> => {
      const payload = await apiDelete<ApiPensionStatementImportRow>(
        `/api/pensions/imports/${input.importId}/rows/${input.rowId}`,
      );
      return normalizePensionStatementImportRow(payload);
    },
    onSuccess: (_data, variables) => invalidatePensionImport(queryClient, variables.importId),
  });
}

export function useDeletePensionTransaction() {
  // The server clears committedTransactionId on imported rows when their transaction is deleted.
  return useDomainMutation('pension', async (id: number) => {
    await api.delete(`/api/pensions/transactions/${id}`);
  });
}

type RestorePensionStatementImportRowInput = {
  importId: number;
  rowId: number;
};

export function useRestorePensionStatementImportRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: RestorePensionStatementImportRowInput,
    ): Promise<PensionStatementImportRow> => {
      const payload = await apiPost<ApiPensionStatementImportRow>(
        `/api/pensions/imports/${input.importId}/rows/${input.rowId}/restore`,
      );
      return normalizePensionStatementImportRow(payload);
    },
    onSuccess: (_data, variables) => invalidatePensionImport(queryClient, variables.importId),
  });
}

export function useUpdatePensionPot() {
  return useDomainMutation('pension', async ({ id, ...pot }: PensionPot) => {
    const payload = await apiPatch<PensionPot>(`/api/pensions/pots/${id}`, pot);
    return payload;
  });
}

type UpdatePensionStatementImportRowInput = {
  importId: number;
  rowId: number;
  payload: UpdatePensionImportRowPayload;
};

export function useUpdatePensionStatementImportRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: UpdatePensionStatementImportRowInput,
    ): Promise<PensionStatementImportRow> => {
      const payload = await apiPatch<ApiPensionStatementImportRow>(
        `/api/pensions/imports/${input.importId}/rows/${input.rowId}`,
        input.payload,
      );
      return normalizePensionStatementImportRow(payload);
    },
    onSuccess: (_data, variables) => invalidatePensionImport(queryClient, variables.importId),
  });
}

export function useUpdatePensionTransaction() {
  return useDomainMutation('pensionTransaction', async ({ id, ...txn }: PensionTransaction) => {
    const payload = await apiPatch<ApiPensionTransaction>(`/api/pensions/transactions/${id}`, txn);
    return normalizePensionTransaction(payload);
  });
}

type UploadPensionStatementDocumentInput = {
  transactionId: number;
  file: File;
};

export function useUploadPensionStatementDocument() {
  return useDomainMutation(
    'pensionDocument',
    async ({ transactionId, file }: UploadPensionStatementDocumentInput) => {
      const formData = new FormData();
      formData.append('file', file);

      const payload = await apiPost<ApiPensionStatementDocument>(
        `/api/pensions/transactions/${transactionId}/document`,
        formData,
      );

      return normalizePensionStatementDocument(payload);
    },
  );
}
