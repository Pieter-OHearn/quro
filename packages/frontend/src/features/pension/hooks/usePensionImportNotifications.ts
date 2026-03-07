import { useQuery } from '@tanstack/react-query';
import type { PensionImportStatus, PensionStatementImportFeedItem } from '@quro/shared';
import { api } from '@/lib/api';
import type { ApiPensionStatementImportFeedItem } from '../types';
import { normalizePensionStatementImportFeedItem } from '../utils/pension-api-normalizers';

const DEFAULT_IMPORT_STATUSES: PensionImportStatus[] = [
  'queued',
  'processing',
  'ready_for_review',
  'failed',
];
const DEFAULT_LIMIT = 30;
const ACTIVE_STATUSES = new Set<PensionImportStatus>(['queued', 'processing']);

export const PENSION_IMPORT_NOTIFICATIONS_QUERY_KEY = [
  'pensions',
  'imports',
  'notifications',
] as const;

type UsePensionImportNotificationsOptions = {
  statuses?: PensionImportStatus[];
  limit?: number;
};

export function usePensionImportNotifications(options: UsePensionImportNotificationsOptions = {}) {
  const statuses = options.statuses ?? DEFAULT_IMPORT_STATUSES;
  const limit = options.limit ?? DEFAULT_LIMIT;

  return useQuery({
    queryKey: [...PENSION_IMPORT_NOTIFICATIONS_QUERY_KEY, statuses.join(','), limit],
    queryFn: async (): Promise<PensionStatementImportFeedItem[]> => {
      const { data } = await api.get('/api/pensions/imports', {
        params: {
          statuses: statuses.join(','),
          limit,
        },
      });

      return (data.data as ApiPensionStatementImportFeedItem[]).map(
        normalizePensionStatementImportFeedItem,
      );
    },
    refetchInterval: (query) => {
      const imports = query.state.data ?? [];
      if (imports.some((item) => ACTIVE_STATUSES.has(item.import.status))) return 2000;
      return 15_000;
    },
  });
}
