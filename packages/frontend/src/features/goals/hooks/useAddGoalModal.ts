import { allocationTotals } from '@/lib/allocationTotals';
import { useMemo, useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { useAssetAllocations } from '@/features/dashboard/hooks';
import { useSavingsAccounts } from '@/features/savings/hooks';
import { DEFAULT_EMOJI, type Goal, type GoalType } from '@quro/shared';
import type { CreateGoalInput, GoalFormField, GoalFormState } from '../types';
import { GOAL_TYPE_META, COLORS } from '../utils/goals-constants';
import { buildGoalPayload } from '../utils/goal-utils';
import { buildDefaultGoalDeadline, getCurrentGoalYear } from '../utils/goal-years';

const defaultForm = (): GoalFormState => {
  const now = new Date();
  const currentYear = getCurrentGoalYear(now);
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return {
    name: '',
    emoji: DEFAULT_EMOJI.goal,
    color: COLORS[0],
    notes: '',
    deadline: buildDefaultGoalDeadline(now),
    year: String(currentYear),
    current: '',
    target: '',
    monthlyContrib: '',
    monthlyTarget: '',
    totalMonths: '12',
    unit: '',
    sourceId: '',
    startMonth: `${currentYear}-${month}-01`,
    currency: '',
  };
};

const SOURCE_TYPE_DEFAULTS: Partial<Record<GoalType, Goal['sourceType']>> = {
  salary: 'salary_latest_gross',
  portfolio: 'portfolio_total',
  net_worth: 'net_worth_total',
  invest_habit: 'invest_habit_buys',
};

export function useAddGoalModal(onSave: (goal: CreateGoalInput) => void, onClose: () => void) {
  const { baseCurrency, convertToBase, fmtBase } = useCurrency();
  const savingsAccountsQuery = useSavingsAccounts();
  const allocationsQuery = useAssetAllocations();
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [type, setType] = useState<GoalType>('savings');
  const [form, setForm] = useState<GoalFormState>(() => ({
    ...defaultForm(),
    currency: baseCurrency,
  }));

  const { portfolioTotal, netWorth } = useMemo(
    () => allocationTotals(allocationsQuery.data, convertToBase),
    [allocationsQuery.data, convertToBase],
  );

  const setField = (key: GoalFormField, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const saveDisabled =
    !form.name.trim() || (type === 'invest_habit' && (!form.monthlyTarget || !form.startMonth));

  const handleSave = () => {
    if (saveDisabled) return;

    const base: Omit<Goal, 'id'> = {
      type,
      sourceType: SOURCE_TYPE_DEFAULTS[type] ?? 'manual',
      sourceId: null,
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
      monthsCompleted: null,
      totalMonths: null,
      unit: null,
      category: GOAL_TYPE_META[type].label,
      currency: (form.currency || baseCurrency) as Goal['currency'],
    };

    onSave(buildGoalPayload(type, base, form));
    onClose();
  };

  return {
    baseCurrency,
    convertToBase,
    fmtBase,
    savingsAccounts: savingsAccountsQuery.data ?? [],
    loadingSavingsAccounts: savingsAccountsQuery.isLoading,
    portfolioTotal,
    netWorth,
    step,
    type,
    form,
    setField,
    handleSave,
    setType,
    setStep,
    saveDisabled,
  };
}
