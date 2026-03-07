import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PensionStatementImportRow } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizePensionStatementImportRow } from '../utils/pension-api-normalizers';
import type { ApiPensionStatementImportRow } from '../types';

type RestorePensionStatementImportRowInput = {
  importId: number;
  rowId: number;
};

export function useRestorePensionStatementImportRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: RestorePensionStatementImportRowInput,
    ): Promise<PensionStatementImportRow> => {
      const { data } = await api.post(
        `/api/pensions/imports/${input.importId}/rows/${input.rowId}/restore`,
      );
      return normalizePensionStatementImportRow(data.data as ApiPensionStatementImportRow);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['pensions', 'imports', variables.importId, 'rows'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['pensions', 'imports', variables.importId],
      });
      void queryClient.invalidateQueries({ queryKey: ['pensions', 'imports', 'list'] });
    },
  });
}
