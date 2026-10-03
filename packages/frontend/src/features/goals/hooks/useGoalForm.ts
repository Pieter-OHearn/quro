import { useMemo, useState } from 'react';
import type { Goal, GoalType } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { allocationTotals } from '@/lib/allocationTotals';
import { useAssetAllocations } from '@/features/dashboard/hooks';
import { useSavingsAccounts } from '@/features/savings/hooks';
import type { CreateGoalInput, GoalFormField, GoalFormState } from '../types';
import { GOAL_TYPE_META } from '../utils/goals-constants';
import { buildGoalPayload } from '../utils/goal-utils';

const SOURCE_TYPE_DEFAULTS: Partial<Record<GoalType, Goal['sourceType']>> = {
  salary: 'salary_latest_gross',
  portfolio: 'portfolio_total',
  net_worth: 'net_worth_total',
  invest_habit: 'invest_habit_buys',
};

function goalProgressFields(goal?: Goal) {
  if (!goal) return { monthsCompleted: null };
  return {
    monthsCompleted: goal.monthsCompleted ?? null,
    startMonth: null,
    missedMonths: goal.missedMonths ?? null,
  };
}

export function buildGoalFormBase(
  type: GoalType,
  form: GoalFormState,
  baseCurrency: string,
  goal?: Goal,
): CreateGoalInput {
  return {
    type,
    sourceType: goal ? goal.sourceType : (SOURCE_TYPE_DEFAULTS[type] ?? 'manual'),
    sourceId: goal?.sourceId ?? null,
    name: form.name.trim(),
    emoji: form.emoji,
    color: form.color,
    notes: form.notes,
    deadline: form.deadline,
    year: Number.parseInt(form.year, 10) || new Date().getFullYear(),
    currentAmount: 0,
    targetAmount: 0,
    monthlyContribution: 0,
    monthlyTarget: null,
    ...goalProgressFields(goal),
    totalMonths: null,
    unit: null,
    category: GOAL_TYPE_META[type].label,
    currency: (form.currency || baseCurrency) as Goal['currency'],
  };
}

export function useGoalForm(
  type: GoalType,
  initialize: (baseCurrency: string) => GoalFormState,
  onSave: (payload: CreateGoalInput) => void,
  onClose: () => void,
  goal?: Goal,
) {
  const { baseCurrency, convertToBase, fmtBase } = useCurrency();
  const savingsAccountsQuery = useSavingsAccounts();
  const allocationsQuery = useAssetAllocations();
  const [form, setForm] = useState(() => initialize(baseCurrency));
  const totals = useMemo(
    () => allocationTotals(allocationsQuery.data, convertToBase),
    [allocationsQuery.data, convertToBase],
  );
  const setField = (key: GoalFormField, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const saveDisabled =
    !form.name.trim() || (type === 'invest_habit' && (!form.monthlyTarget || !form.startMonth));
  const handleSave = () => {
    if (saveDisabled) return;
    const base = buildGoalFormBase(type, form, baseCurrency, goal);
    onSave(buildGoalPayload(type, base, form));
    onClose();
  };
  return {
    baseCurrency,
    convertToBase,
    fmtBase,
    savingsAccounts: savingsAccountsQuery.data ?? [],
    loadingSavingsAccounts: savingsAccountsQuery.isLoading,
    ...totals,
    type,
    form,
    setField,
    saveDisabled,
    handleSave,
  };
}
