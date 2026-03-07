import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';
import { PENSION_IMPORT_NOTIFICATIONS_QUERY_KEY } from './usePensionImportNotifications';

type CommitPensionStatementImportResponse = {
  import: unknown;
  transactionIds: number[];
};

export function useCommitPensionStatementImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (importId: number): Promise<CommitPensionStatementImportResponse> => {
      const { data } = await api.post(`/api/pensions/imports/${importId}/commit`);
      return data.data as CommitPensionStatementImportResponse;
    },
    onSuccess: (_data, importId) => {
      invalidatePensionQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['pensions', 'imports', importId] });
      void queryClient.invalidateQueries({ queryKey: ['pensions', 'imports', importId, 'rows'] });
      void queryClient.invalidateQueries({ queryKey: PENSION_IMPORT_NOTIFICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['pensions', 'imports', 'list'] });
    },
  });
}
