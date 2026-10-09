import { queryKeys } from '@/lib/queryKeys';
import { apiGetAllPages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { ApiPensionStatementDocument } from '../types';
import { normalizePensionStatementDocument } from '../utils/pension-api-normalizers';

export function usePensionStatementDocuments(potId?: number) {
  const normalizedPotId =
    Number.isInteger(potId) && (potId as number) > 0 ? (potId as number) : undefined;

  return useQuery({
    queryKey: queryKeys.pensions.documentList(normalizedPotId),
    queryFn: async ({ signal }) => {
      const params = normalizedPotId ? { potId: normalizedPotId } : undefined;
      const payload = await apiGetAllPages<ApiPensionStatementDocument>('/api/pensions/documents', {
        params,
        signal,
      });
      return payload
        .map(normalizePensionStatementDocument)
        .filter((document) => document.id > 0 && document.transactionId > 0 && document.potId > 0);
    },
  });
}
