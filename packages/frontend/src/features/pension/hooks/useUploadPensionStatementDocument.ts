import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';
import { normalizePensionStatementDocument } from '../utils/pension-api-normalizers';
import type { ApiPensionStatementDocument } from '../types';

type UploadPensionStatementDocumentInput = {
  transactionId: number;
  file: File;
};

export function useUploadPensionStatementDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ transactionId, file }: UploadPensionStatementDocumentInput) => {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post(
        `/api/pensions/transactions/${transactionId}/document`,
        formData,
      );

      return normalizePensionStatementDocument(data.data as ApiPensionStatementDocument);
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}
