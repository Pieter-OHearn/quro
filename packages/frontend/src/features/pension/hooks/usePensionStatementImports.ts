import { useQuery } from '@tanstack/react-query';
import type { PensionImportStatus, PensionStatementImportSummary } from '@quro/shared';
import { api } from '@/lib/api';
import type { ApiPensionStatementImportFeedItem } from '../types';
import { normalizePensionStatementImportFeedItem } from '../utils/pension-api-normalizers';

const DEFAULT_IMPORT_STATUSES: PensionImportStatus[] = [
  'queued',
  'processing',
  'ready_for_review',
  'failed',
];

type UsePensionStatementImportsOptions = {
  statuses?: PensionImportStatus[];
  limit?: number;
};

export function usePensionStatementImports(options: UsePensionStatementImportsOptions = {}) {
  const statuses = options.statuses ?? DEFAULT_IMPORT_STATUSES;
  const limit = options.limit ?? 20;

  return useQuery({
    queryKey: ['pensions', 'imports', 'list', statuses.join(','), limit],
    queryFn: async (): Promise<PensionStatementImportSummary[]> => {
      const { data } = await api.get('/api/pensions/imports', {
        params: {
          statuses: statuses.join(','),
          limit,
        },
      });

      return (data.data as ApiPensionStatementImportFeedItem[])
        .map(normalizePensionStatementImportFeedItem)
        .map(({ import: importItem, pot }) => ({
          id: importItem.id,
          potId: importItem.potId,
          status: importItem.status,
          fileName: importItem.fileName,
          errorMessage: importItem.errorMessage,
          createdAt: importItem.createdAt,
          updatedAt: importItem.updatedAt,
          totalRows: importItem.totalRows ?? 0,
          deletedRows: importItem.deletedRows ?? 0,
          activeRows: importItem.activeRows ?? 0,
          potName: pot.name,
          potProvider: pot.provider,
          potEmoji: pot.emoji ?? '🏦',
        }));
    },
    refetchInterval: (query) => {
      const imports = query.state.data ?? [];
      if (imports.some((item) => item.status === 'queued' || item.status === 'processing')) {
        return 2000;
      }
      return false;
    },
  });
}
