import { useQuery } from '@tanstack/react-query';
import type { PensionImportStatus, PensionStatementImportRow } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizePensionStatementImportRow } from '../utils/pension-api-normalizers';
import type { ApiPensionStatementImportRow } from '../types';

export function usePensionStatementImportRows(
  importId: number | null,
  importStatus: PensionImportStatus | null,
) {
  return useQuery({
    queryKey: ['pensions', 'imports', importId, 'rows'],
    enabled: Number.isInteger(importId) && (importId ?? 0) > 0,
    queryFn: async (): Promise<PensionStatementImportRow[]> => {
      const { data } = await api.get(`/api/pensions/imports/${importId}/rows`);
      return (data.data as ApiPensionStatementImportRow[]).map(normalizePensionStatementImportRow);
    },
    refetchInterval: (query) => {
      if (importStatus === 'queued' || importStatus === 'processing') return 2000;
      if (importStatus === 'ready_for_review' && (query.state.data?.length ?? 0) === 0) {
        return 1500;
      }
      return false;
    },
  });
}
