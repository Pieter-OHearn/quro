import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Mortgage as MortgageType } from '@quro/shared';
import { api } from '@/lib/api';
import type { CreateMortgagePayload } from '../types';
import { normalizeMortgage } from '../utils/mortgage-normalizers';

export function useCreateMortgage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (mortgage: CreateMortgagePayload) => {
      const { data } = await api.post('/api/mortgages', mortgage);
      return normalizeMortgage(data.data as MortgageType);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['investments'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
