import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Mortgage, MortgageTransaction } from '@quro/shared';

export type CreateMortgagePayload = Omit<Mortgage, 'id'> & {
  linkedPropertyId: number;
};

export type UpdateMortgagePayload = Partial<Omit<Mortgage, 'id'>> & {
  id: number;
  linkedPropertyId?: number;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeMortgage(raw: Mortgage): Mortgage {
  return {
    ...raw,
    originalAmount: toNumber(raw.originalAmount),
    outstandingBalance: toNumber(raw.outstandingBalance),
    propertyValue: toNumber(raw.propertyValue),
    monthlyPayment: toNumber(raw.monthlyPayment),
    interestRate: toNumber(raw.interestRate),
    termYears: toNumber(raw.termYears),
    overpaymentLimit: toNumber(raw.overpaymentLimit),
  };
}

function normalizeMortgageTransaction(raw: MortgageTransaction): MortgageTransaction {
  return {
    ...raw,
    amount: toNumber(raw.amount),
    interest: raw.interest == null ? null : toNumber(raw.interest),
    principal: raw.principal == null ? null : toNumber(raw.principal),
    fixedYears: raw.fixedYears == null ? null : toNumber(raw.fixedYears),
  };
}

export function useMortgages() {
  return useQuery({
    queryKey: ['mortgages'],
    queryFn: async () => {
      const { data } = await api.get('/api/mortgages');
      return (data.data as Mortgage[]).map(normalizeMortgage);
    },
  });
}

export function useMortgageTransactions(mortgageId?: number) {
  return useQuery({
    queryKey: ['mortgages', 'transactions', mortgageId],
    queryFn: async () => {
      const params = mortgageId ? { mortgageId } : {};
      const { data } = await api.get('/api/mortgages/transactions', {
        params,
      });
      return (data.data as MortgageTransaction[]).map(normalizeMortgageTransaction);
    },
  });
}

export function useCreateMortgage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mortgage: CreateMortgagePayload) => {
      const { data } = await api.post('/api/mortgages', mortgage);
      return normalizeMortgage(data.data as Mortgage);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['investments'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateMortgage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...mortgage }: UpdateMortgagePayload) => {
      const { data } = await api.patch(`/api/mortgages/${id}`, mortgage);
      return normalizeMortgage(data.data as Mortgage);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['investments'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteMortgage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/mortgages/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['investments'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateMortgageTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (txn: Omit<MortgageTransaction, 'id'>) => {
      const { data } = await api.post('/api/mortgages/transactions', txn);
      return normalizeMortgageTransaction(data.data as MortgageTransaction);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteMortgageTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/mortgages/transactions/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
