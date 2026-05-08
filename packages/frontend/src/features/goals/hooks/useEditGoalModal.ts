import { useMemo, useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { useAssetAllocations } from '@/features/dashboard/hooks';
import { useSavingsAccounts } from '@/features/savings/hooks';
import type { Goal, GoalType } from '@quro/shared';
import type { GoalFormField, GoalFormState, UpdateGoalInput } from '../types';
import { GOAL_TYPE_META, COLORS } from '../utils/goals-constants';
import { buildGoalPayload, normalizeGoalType } from '../utils/goal-utils';

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function deadlineToDateString(deadline: string): string {
  if (!deadline) return '';
  const match = deadline.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return '';
  const month = monthNames.indexOf(match[1]);
  if (month === -1) return '';
  return `${match[2]}-${String(month + 1).padStart(2, '0')}-01`;
}

function currentMonthDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-01`;
}

function goalAmountFields(goal: Goal) {
  return {
    current: String(goal.currentAmount ?? ''),
    target: String(goal.targetAmount ?? ''),
    monthlyContrib: String(goal.monthlyContribution ?? ''),
    monthlyTarget: String(goal.monthlyTarget ?? ''),
    totalMonths: String(goal.totalMonths ?? 12),
  };
}

function goalToFormState(goal: Goal, baseCurrency: string): GoalFormState {
  return {
    name: goal.name,
    emoji: goal.emoji,
    color: goal.color ?? COLORS[0],
    notes: goal.notes ?? '',
    deadline: goal.deadline,
    year: String(goal.year ?? new Date().getFullYear()),
    ...goalAmountFields(goal),
    unit: goal.unit ?? '',
    sourceId: goal.sourceId != null ? String(goal.sourceId) : '',
    startMonth:
      goal.startMonth != null ? deadlineToDateString(goal.startMonth) : currentMonthDateString(),
    currency: goal.currency ?? baseCurrency,
  };
}

export function useEditGoalModal(
  goal: Goal,
  onUpdate: (input: UpdateGoalInput) => void,
  onClose: () => void,
) {
  const { baseCurrency, convertToBase, fmtBase } = useCurrency();
  const savingsAccountsQuery = useSavingsAccounts();
  const allocationsQuery = useAssetAllocations();

  const type = normalizeGoalType(goal);
  const [form, setForm] = useState<GoalFormState>(() => goalToFormState(goal, baseCurrency));

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

  const saveDisabled =
    !form.name.trim() || (type === 'invest_habit' && (!form.monthlyTarget || !form.startMonth));

  const handleSave = () => {
    if (saveDisabled) return;

    const base = {
      type,
      sourceType: goal.sourceType,
      sourceId: goal.sourceId ?? null,
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
      monthsCompleted: goal.monthsCompleted ?? null,
      totalMonths: null,
      unit: null,
      category: GOAL_TYPE_META[type].label,
      currency: (form.currency || baseCurrency) as Goal['currency'],
      startMonth: null,
      missedMonths: goal.missedMonths ?? null,
    };

    const payload = buildGoalPayload(type as GoalType, base as never, form);
    onUpdate({ id: goal.id, ...payload });
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
    type,
    form,
    setField,
    handleSave,
    saveDisabled,
  };
}
