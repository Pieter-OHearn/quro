import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiPensionPot } from '../types';
import { normalizePensionPot } from '../utils/pension-api-normalizers';

export function usePensionPots() {
  return useQuery({
    queryKey: ['pensions', 'pots'],
    queryFn: async () => {
      const { data } = await api.get('/api/pensions/pots');
      return (data.data as ApiPensionPot[]).map(normalizePensionPot).filter((pot) => pot.id > 0);
    },
  });
}
