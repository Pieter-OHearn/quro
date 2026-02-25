import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PensionPot, PensionTransaction } from "@quro/shared";

type NumericLike = number | string | null | undefined;
type IntegerLike = number | string | null | undefined;

type ApiPensionPot = Omit<PensionPot, "balance" | "employeeMonthly" | "employerMonthly"> & {
  balance: NumericLike;
  employeeMonthly: NumericLike;
  employerMonthly: NumericLike;
};

type ApiPensionTransaction = Omit<PensionTransaction, "amount"> & {
  amount: NumericLike;
};

const toNumber = (value: NumericLike): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toPositiveInt = (value: IntegerLike): number => {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
};

const normalizePot = (pot: ApiPensionPot): PensionPot => ({
  ...pot,
  id: toPositiveInt((pot as { id?: IntegerLike }).id),
  balance: toNumber(pot.balance),
  employeeMonthly: toNumber(pot.employeeMonthly),
  employerMonthly: toNumber(pot.employerMonthly),
});

const normalizeTransaction = (txn: ApiPensionTransaction): PensionTransaction => ({
  ...txn,
  id: toPositiveInt((txn as { id?: IntegerLike }).id),
  potId: toPositiveInt((txn as { potId?: IntegerLike }).potId),
  amount: toNumber(txn.amount),
});

export function usePensionPots() {
  return useQuery({
    queryKey: ["pensions", "pots"],
    queryFn: async () => {
      const { data } = await api.get("/api/pensions/pots");
      return (data.data as ApiPensionPot[]).map(normalizePot).filter((pot) => pot.id > 0);
    },
  });
}

export function usePensionTransactions(potId?: number) {
  const normalizedPotId = Number.isInteger(potId) && (potId as number) > 0
    ? (potId as number)
    : undefined;

  return useQuery({
    queryKey: ["pensions", "transactions", normalizedPotId],
    queryFn: async () => {
      const params = normalizedPotId ? { potId: normalizedPotId } : undefined;
      const { data } = await api.get("/api/pensions/transactions", { params });
      return (data.data as ApiPensionTransaction[])
        .map(normalizeTransaction)
        .filter((txn) => txn.id > 0 && txn.potId > 0);
    },
  });
}

export function useCreatePensionPot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pot: Omit<PensionPot, "id">) => {
      const { data } = await api.post("/api/pensions/pots", pot);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pensions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdatePensionPot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...pot }: PensionPot) => {
      const { data } = await api.patch(`/api/pensions/pots/${id}`, pot);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pensions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeletePensionPot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/pensions/pots/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pensions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreatePensionTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (txn: Omit<PensionTransaction, "id">) => {
      const { data } = await api.post("/api/pensions/transactions", txn);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pensions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeletePensionTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/pensions/transactions/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pensions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
