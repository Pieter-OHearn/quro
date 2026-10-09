import { queryKeys } from '@/lib/queryKeys';
import { apiGetAllPages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { PensionImportStatus, PensionStatementImportRow } from '@quro/shared';
import { normalizePensionStatementImportRow } from '../utils/pension-api-normalizers';
import type { ApiPensionStatementImportRow } from '../types';

export function usePensionStatementImportRows(
  importId: number | null,
  importStatus: PensionImportStatus | null,
) {
  return useQuery({
    queryKey: queryKeys.pensions.importRows(importId),
    enabled: Number.isInteger(importId) && (importId ?? 0) > 0,
    queryFn: async ({ signal }): Promise<PensionStatementImportRow[]> => {
      const payload = await apiGetAllPages<ApiPensionStatementImportRow>(
        `/api/pensions/imports/${importId}/rows`,
        { signal },
      );
      return payload.map(normalizePensionStatementImportRow);
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
