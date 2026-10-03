import { useGoalForm } from './useGoalForm';
import { getMonthAbbreviationIndex, type Goal, DEFAULT_EMOJI } from '@quro/shared';
import type { GoalFormState, UpdateGoalInput } from '../types';
import { COLORS } from '../utils/goals-constants';
import { normalizeGoalType } from '../utils/goal-utils';

function deadlineToDateString(deadline: string): string {
  if (!deadline) return '';
  const match = deadline.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return '';
  const month = getMonthAbbreviationIndex(match[1]);
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
    emoji: goal.emoji ?? DEFAULT_EMOJI.goal,
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
  return useGoalForm(
    normalizeGoalType(goal),
    (baseCurrency) => goalToFormState(goal, baseCurrency),
    (payload) => onUpdate({ id: goal.id, ...payload }),
    onClose,
    goal,
  );
}
