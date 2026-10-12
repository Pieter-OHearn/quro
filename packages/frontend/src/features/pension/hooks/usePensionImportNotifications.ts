import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { loadAppCapabilities } from '@/lib/useAppCapabilities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PensionImportStatus, PensionStatementImportFeedItem } from '@quro/shared';
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

export const PENSION_IMPORT_NOTIFICATIONS_QUERY_KEY = queryKeys.pensions.notifications;

type UsePensionImportNotificationsOptions = {
  statuses?: PensionImportStatus[];
  limit?: number;
};

export function usePensionImportNotifications(options: UsePensionImportNotificationsOptions = {}) {
  const statuses = options.statuses ?? DEFAULT_IMPORT_STATUSES;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.pensions.notificationList(statuses.join(','), limit),
    queryFn: async (): Promise<PensionStatementImportFeedItem[]> => {
      // Without a configured import service the backend has no import routes. A configured
      // service whose worker is down still lists the imports made before.
      const capabilities = await loadAppCapabilities(queryClient);
      if (capabilities?.pensionStatementImport.reason === 'not_configured') return [];
      const payload = await apiGet<ApiPensionStatementImportFeedItem[]>('/api/pensions/imports', {
        params: {
          statuses: statuses.join(','),
          limit,
        },
      });

      return payload.map(normalizePensionStatementImportFeedItem);
    },
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) => {
      const imports = query.state.data ?? [];
      if (imports.some((item) => ACTIVE_STATUSES.has(item.import.status))) return 2000;
      return false;
    },
  });
}
