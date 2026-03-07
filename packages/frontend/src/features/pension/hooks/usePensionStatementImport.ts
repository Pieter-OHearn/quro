import { useQuery } from '@tanstack/react-query';
import type { PensionStatementImport } from '@quro/shared';
import { api } from '@/lib/api';
import type { ApiPensionStatementImport } from '../types';
import { normalizePensionStatementImport } from '../utils/pension-api-normalizers';

export function usePensionStatementImport(importId: number | null) {
  return useQuery({
    queryKey: ['pensions', 'imports', importId],
    enabled: Number.isInteger(importId) && (importId ?? 0) > 0,
    queryFn: async (): Promise<PensionStatementImport> => {
      const { data } = await api.get(`/api/pensions/imports/${importId}`);
      return normalizePensionStatementImport(data.data as ApiPensionStatementImport);
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'processing') return 2000;
      return false;
    },
  });
}
