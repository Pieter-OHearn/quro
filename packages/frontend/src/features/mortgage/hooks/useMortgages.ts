import { useQuery } from '@tanstack/react-query';
import type { Mortgage as MortgageType } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizeMortgage } from '../utils/mortgage-normalizers';

export function useMortgages() {
  return useQuery({
    queryKey: ['mortgages'],
    queryFn: async () => {
      const { data } = await api.get('/api/mortgages');
      return (data.data as MortgageType[]).map(normalizeMortgage);
    },
  });
}
