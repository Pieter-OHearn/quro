import { useMemo, useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { useAssetAllocations } from '@/features/dashboard/hooks';
import { useSavingsAccounts } from '@/features/savings/hooks';
import type { Goal, GoalType } from '@quro/shared';
import type { CreateGoalInput, GoalFormField, GoalFormState } from '../types';
import { GOAL_TYPE_META, COLORS } from '../utils/goals-constants';
import { buildGoalPayload } from '../utils/goal-utils';
import { buildDefaultGoalDeadline, getCurrentGoalYear } from '../utils/goal-years';

const defaultForm = (): GoalFormState => {
  const now = new Date();
  const currentYear = getCurrentGoalYear(now);

  return {
    name: '',
    emoji: '🎯',
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
  const [form, setForm] = useState<GoalFormState>(defaultForm);

  const { portfolioTotal, netWorth } = useMemo(() => {
    const allocs = allocationsQuery.data;
    if (!allocs) return { portfolioTotal: 0, netWorth: 0 };
    const currency = allocs.allocations[0]?.currency ?? 'EUR';
    const totalAssets = allocs.allocations.reduce(
      (sum, a) => sum + convertToBase(a.value, a.currency),
      0,
    );
    const brokerage = allocs.allocations.find((a) => a.name === 'Brokerage');
    return {
      portfolioTotal: brokerage ? convertToBase(brokerage.value, brokerage.currency) : 0,
      netWorth: totalAssets - convertToBase(allocs.liabilitiesTotal, currency),
    };
  }, [allocationsQuery.data, convertToBase]);

  const setField = (key: GoalFormField, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = () => {
    if (!form.name.trim()) return;

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
      currency: baseCurrency as Goal['currency'],
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
  };
}
