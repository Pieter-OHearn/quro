import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PensionStatementImportRow } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizePensionStatementImportRow } from '../utils/pension-api-normalizers';
import type { ApiPensionStatementImportRow } from '../types';

type DeletePensionStatementImportRowInput = {
  importId: number;
  rowId: number;
};

export function useDeletePensionStatementImportRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: DeletePensionStatementImportRowInput,
    ): Promise<PensionStatementImportRow> => {
      const { data } = await api.delete(
        `/api/pensions/imports/${input.importId}/rows/${input.rowId}`,
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
