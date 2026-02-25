import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Holding,
  HoldingTransaction,
  Property,
  PropertyTransaction,
} from "@quro/shared";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableId(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizeHolding(raw: Holding): Holding {
  return {
    ...raw,
    currentPrice: toNumber(raw.currentPrice),
  };
}

function normalizeHoldingTransaction(raw: HoldingTransaction): HoldingTransaction {
  return {
    ...raw,
    shares: raw.shares == null ? null : toNumber(raw.shares),
    price: toNumber(raw.price),
  };
}

function normalizeProperty(raw: Property): Property {
  return {
    ...raw,
    purchasePrice: toNumber(raw.purchasePrice),
    currentValue: toNumber(raw.currentValue),
    mortgage: toNumber(raw.mortgage),
    mortgageId: toNullableId(raw.mortgageId),
    monthlyRent: toNumber(raw.monthlyRent),
  };
}

function normalizePropertyTransaction(raw: PropertyTransaction): PropertyTransaction {
  return {
    ...raw,
    amount: toNumber(raw.amount),
    interest: raw.interest == null ? null : toNumber(raw.interest),
    principal: raw.principal == null ? null : toNumber(raw.principal),
  };
}

// ── Holdings ──────────────────────────────────────────────────────────

export function useHoldings() {
  return useQuery({
    queryKey: ["investments", "holdings"],
    queryFn: async () => {
      const { data } = await api.get("/api/investments/holdings");
      return (data.data as Holding[]).map(normalizeHolding);
    },
  });
}

export function useHoldingTransactions(holdingId?: number) {
  return useQuery({
    queryKey: ["investments", "holdingTransactions", holdingId],
    queryFn: async () => {
      const params = holdingId ? { holdingId } : {};
      const { data } = await api.get("/api/investments/holding-transactions", {
        params,
      });
      return (data.data as HoldingTransaction[]).map(normalizeHoldingTransaction);
    },
  });
}

export function useCreateHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (holding: Omit<Holding, "id">) => {
      const { data } = await api.post("/api/investments/holdings", holding);
      return normalizeHolding(data.data as Holding);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...holding }: Holding) => {
      const { data } = await api.patch(
        `/api/investments/holdings/${id}`,
        holding,
      );
      return normalizeHolding(data.data as Holding);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/investments/holdings/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreateHoldingTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (txn: Omit<HoldingTransaction, "id">) => {
      const { data } = await api.post(
        "/api/investments/holding-transactions",
        txn,
      );
      return normalizeHoldingTransaction(data.data as HoldingTransaction);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteHoldingTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/investments/holding-transactions/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ── Properties ────────────────────────────────────────────────────────

export function useProperties() {
  return useQuery({
    queryKey: ["investments", "properties"],
    queryFn: async () => {
      const { data } = await api.get("/api/investments/properties");
      return (data.data as Property[]).map(normalizeProperty);
    },
  });
}

export function usePropertyTransactions(propertyId?: number) {
  return useQuery({
    queryKey: ["investments", "propertyTransactions", propertyId],
    queryFn: async () => {
      const params = propertyId ? { propertyId } : {};
      const { data } = await api.get(
        "/api/investments/property-transactions",
        { params },
      );
      return (data.data as PropertyTransaction[]).map(normalizePropertyTransaction);
    },
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (property: Omit<Property, "id">) => {
      const { data } = await api.post("/api/investments/properties", property);
      return normalizeProperty(data.data as Property);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...property }: Property) => {
      const { data } = await api.patch(
        `/api/investments/properties/${id}`,
        property,
      );
      return normalizeProperty(data.data as Property);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/investments/properties/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreatePropertyTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (txn: Omit<PropertyTransaction, "id">) => {
      const { data } = await api.post(
        "/api/investments/property-transactions",
        txn,
      );
      return normalizePropertyTransaction(data.data as PropertyTransaction);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeletePropertyTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/investments/property-transactions/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
