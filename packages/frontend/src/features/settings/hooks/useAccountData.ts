import { useMutation, useQuery } from '@tanstack/react-query';
import type { AccountDeletionPreview, DeleteAccountInput, DeleteAccountResult } from '@quro/shared';
import { api, apiDelete, apiGet } from '@/lib/api';
import { clearAuthQueryCache } from '@/lib/authCache';
import { queryKeys } from '@/lib/queryKeys';

const DEFAULT_EXPORT_FILE_NAME = 'quro-export.zip';
const EXPORT_FAILED_MESSAGE = 'The export could not be created. Try again.';

function exportFileName(disposition: unknown): string {
  const match = typeof disposition === 'string' ? /filename="([^"]+)"/.exec(disposition) : null;
  return match?.[1] ?? DEFAULT_EXPORT_FILE_NAME;
}

/** The server's reason for refusing an export, which arrives as JSON inside a blob. */
async function readExportError(error: unknown): Promise<string> {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { error?: unknown };
      if (typeof parsed.error === 'string') return parsed.error;
    } catch {
      // Not JSON: fall through to the generic message.
    }
  }
  return EXPORT_FAILED_MESSAGE;
}

/** Downloads the account's data as a ZIP archive. */
export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      try {
        const response = await api.get<Blob>('/api/settings/export', { responseType: 'blob' });
        const url = URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = exportFileName(response.headers['content-disposition']);
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        throw new Error(await readExportError(error), { cause: error });
      }
    },
  });
}

/** What deleting the account would remove; fetched only while the confirmation is open. */
export function useAccountDeletionPreview(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.accountDeletionPreview,
    queryFn: () => apiGet<AccountDeletionPreview>('/api/settings/account'),
    enabled,
    gcTime: 0,
  });
}

/** Deletes the account. The caller signs the user out afterwards. */
export function useDeleteAccount(onDeleted: () => void) {
  return useMutation({
    mutationFn: (input: DeleteAccountInput) =>
      apiDelete<DeleteAccountResult>('/api/settings/account', { data: input }),
    onSuccess: () => {
      clearAuthQueryCache();
      onDeleted();
    },
  });
}
