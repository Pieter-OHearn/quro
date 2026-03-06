import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiPensionStatementDocument } from '../types';
import { normalizePensionStatementDocument } from '../utils/pension-api-normalizers';

export function usePensionStatementDocuments(potId?: number) {
  const normalizedPotId =
    Number.isInteger(potId) && (potId as number) > 0 ? (potId as number) : undefined;

  return useQuery({
    queryKey: ['pensions', 'documents', normalizedPotId],
    queryFn: async () => {
      const params = normalizedPotId ? { potId: normalizedPotId } : undefined;
      const { data } = await api.get('/api/pensions/documents', { params });
      return (data.data as ApiPensionStatementDocument[])
        .map(normalizePensionStatementDocument)
        .filter((document) => document.id > 0 && document.transactionId > 0 && document.potId > 0);
    },
  });
}
