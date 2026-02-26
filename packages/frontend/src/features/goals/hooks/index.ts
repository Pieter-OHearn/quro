import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Goal, GoalType } from "@quro/shared";

type ApiGoal = Omit<
  Goal,
  | "type"
  | "currentAmount"
  | "targetAmount"
  | "year"
  | "monthlyContribution"
  | "monthlyTarget"
  | "monthsCompleted"
  | "totalMonths"
> & {
  type?: GoalType | string | null;
  currentAmount: number | string;
  targetAmount: number | string;
  year?: number | string | null;
  monthlyContribution: number | string;
  monthlyTarget?: number | string | null;
  monthsCompleted?: number | string | null;
  totalMonths?: number | string | null;
};

const GOAL_TYPES: GoalType[] = [
  "savings",
  "salary",
  "invest_habit",
  "portfolio",
  "net_worth",
  "annual",
];

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toNullableInteger = (value: number | string | null | undefined): number | null => {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
};

const inferYearFromDeadline = (deadline: string | null | undefined): number | null => {
  if (!deadline) return null;
  const match = deadline.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeGoalType = (value: GoalType | string | null | undefined): GoalType => {
  if (!value) return "savings";
  return GOAL_TYPES.includes(value as GoalType) ? (value as GoalType) : "savings";
};

const normalizeGoal = (goal: ApiGoal): Goal => ({
  ...goal,
  type: normalizeGoalType(goal.type),
  name: goal.name?.trim() || "Untitled Goal",
  emoji: goal.emoji || "🎯",
  currentAmount: toNumber(goal.currentAmount),
  targetAmount: toNumber(goal.targetAmount),
  deadline: goal.deadline?.trim() || "TBD",
  year: toNullableInteger(goal.year) ?? inferYearFromDeadline(goal.deadline) ?? new Date().getFullYear(),
  category: goal.category?.trim() || "Other",
  monthlyContribution: toNumber(goal.monthlyContribution),
  monthlyTarget: goal.monthlyTarget == null ? null : toNumber(goal.monthlyTarget),
  monthsCompleted: toNullableInteger(goal.monthsCompleted),
  totalMonths: toNullableInteger(goal.totalMonths),
  unit: goal.unit ?? null,
  color: goal.color || "#6366f1",
  notes: goal.notes || "",
  currency: goal.currency || "EUR",
});

export type CreateGoalInput = Omit<Goal, "id">;
export type UpdateGoalInput = { id: number } & Partial<Omit<Goal, "id">>;

export function useGoals() {
  return useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data } = await api.get("/api/goals");
      return (data.data as ApiGoal[]).map(normalizeGoal);
    },
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goal: CreateGoalInput) => {
      const { data } = await api.post("/api/goals", goal);
      return normalizeGoal(data.data as ApiGoal);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...goal }: UpdateGoalInput) => {
      const { data } = await api.patch(`/api/goals/${id}`, goal);
      return normalizeGoal(data.data as ApiGoal);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/goals/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
