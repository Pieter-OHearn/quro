import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PensionStatementImportRow } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizePensionStatementImportRow } from '../utils/pension-api-normalizers';
import type { ApiPensionStatementImportRow, UpdatePensionImportRowPayload } from '../types';

type UpdatePensionStatementImportRowInput = {
  importId: number;
  rowId: number;
  payload: UpdatePensionImportRowPayload;
};

export function useUpdatePensionStatementImportRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: UpdatePensionStatementImportRowInput,
    ): Promise<PensionStatementImportRow> => {
      const { data } = await api.patch(
        `/api/pensions/imports/${input.importId}/rows/${input.rowId}`,
        input.payload,
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
