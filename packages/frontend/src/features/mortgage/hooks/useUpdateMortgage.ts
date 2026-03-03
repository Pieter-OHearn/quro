import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Mortgage as MortgageType } from '@quro/shared';
import { api } from '@/lib/api';
import type { UpdateMortgagePayload } from '../types';
import { normalizeMortgage } from '../utils/mortgage-normalizers';

export function useUpdateMortgage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...mortgage }: UpdateMortgagePayload) => {
      const { data } = await api.patch(`/api/mortgages/${id}`, mortgage);
      return normalizeMortgage(data.data as MortgageType);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['investments'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
