import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { PensionStatementImport } from '@quro/shared';
import type { ApiPensionStatementImport } from '../types';

export function usePensionStatementImport(importId: number | null) {
  return useQuery({
    queryKey: queryKeys.pensions.import(importId),
    enabled: Number.isInteger(importId) && (importId ?? 0) > 0,
    queryFn: async (): Promise<PensionStatementImport> => {
      return apiGet<ApiPensionStatementImport>(`/api/pensions/imports/${importId}`);
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'processing') return 2000;
      return false;
    },
  });
}
