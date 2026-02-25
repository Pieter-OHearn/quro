import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Payslip, SalaryHistory } from "@quro/shared";

type ApiPayslip = Omit<Payslip, "gross" | "tax" | "pension" | "net" | "bonus"> & {
  gross: number | string;
  tax: number | string;
  pension: number | string;
  net: number | string;
  bonus: number | string | null;
};

type ApiSalaryHistory = Omit<SalaryHistory, "annualSalary"> & {
  annualSalary: number | string;
};

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizePayslip = (payslip: ApiPayslip): Payslip => ({
  ...payslip,
  gross: toNumber(payslip.gross),
  tax: toNumber(payslip.tax),
  pension: toNumber(payslip.pension),
  net: toNumber(payslip.net),
  bonus: payslip.bonus == null ? null : toNumber(payslip.bonus),
});

const normalizeSalaryHistory = (entry: ApiSalaryHistory): SalaryHistory => ({
  ...entry,
  annualSalary: toNumber(entry.annualSalary),
});

export function usePayslips() {
  return useQuery({
    queryKey: ["salary", "payslips"],
    queryFn: async () => {
      const { data } = await api.get("/api/salary/payslips");
      return (data.data as ApiPayslip[]).map(normalizePayslip);
    },
  });
}

export function useCreatePayslip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payslip: Omit<Payslip, "id">) => {
      const { data } = await api.post("/api/salary/payslips", payslip);
      return normalizePayslip(data.data as ApiPayslip);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salary"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeletePayslip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/salary/payslips/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salary"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSalaryHistory() {
  return useQuery({
    queryKey: ["salary", "history"],
    queryFn: async () => {
      const { data } = await api.get("/api/salary/history");
      return (data.data as ApiSalaryHistory[]).map(normalizeSalaryHistory);
    },
  });
}

export function useCreateSalaryHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Omit<SalaryHistory, "id">) => {
      const { data } = await api.post("/api/salary/history", entry);
      return normalizeSalaryHistory(data.data as ApiSalaryHistory);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salary"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
