import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SavingsAccount, SavingsTransaction } from "@quro/shared";

export function useSavingsAccounts() {
  return useQuery({
    queryKey: ["savings", "accounts"],
    queryFn: async () => {
      const { data } = await api.get("/api/savings/accounts");
      return data.data as SavingsAccount[];
    },
  });
}

export function useSavingsTransactions(accountId?: number) {
  return useQuery({
    queryKey: ["savings", "transactions", accountId],
    queryFn: async () => {
      const params = accountId ? { accountId } : {};
      const { data } = await api.get("/api/savings/transactions", { params });
      return data.data as SavingsTransaction[];
    },
  });
}

export function useCreateSavingsAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (account: Omit<SavingsAccount, "id">) => {
      const { data } = await api.post("/api/savings/accounts", account);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["savings"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateSavingsAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...account }: SavingsAccount) => {
      const { data } = await api.patch(`/api/savings/accounts/${id}`, account);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["savings"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteSavingsAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/savings/accounts/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["savings"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreateSavingsTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (txn: Omit<SavingsTransaction, "id">) => {
      const { data } = await api.post("/api/savings/transactions", txn);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["savings"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteSavingsTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/savings/transactions/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["savings"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
