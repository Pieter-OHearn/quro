import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PensionStatementImport } from '@quro/shared';
import { api } from '@/lib/api';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';
import { normalizePensionStatementImport } from '../utils/pension-api-normalizers';
import type { ApiPensionStatementImport } from '../types';
import { PENSION_IMPORT_NOTIFICATIONS_QUERY_KEY } from './usePensionImportNotifications';

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
      const { data } = await api.post('/api/pensions/imports', formData);
      return normalizePensionStatementImport(data.data as ApiPensionStatementImport);
    },
    onSuccess: (createdImport) => {
      void queryClient.invalidateQueries({ queryKey: ['pensions', 'imports', createdImport.id] });
      void queryClient.invalidateQueries({ queryKey: PENSION_IMPORT_NOTIFICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['pensions', 'imports', 'list'] });
      invalidatePensionQueries(queryClient);
    },
  });
}
