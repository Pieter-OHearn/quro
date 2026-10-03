import { useGoalForm } from './useGoalForm';
import { useState } from 'react';
import { DEFAULT_EMOJI, type GoalType } from '@quro/shared';
import type { CreateGoalInput, GoalFormState } from '../types';
import { COLORS } from '../utils/goals-constants';
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

export function useAddGoalModal(onSave: (goal: CreateGoalInput) => void, onClose: () => void) {
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [type, setType] = useState<GoalType>('savings');
  const form = useGoalForm(
    type,
    (baseCurrency) => ({ ...defaultForm(), currency: baseCurrency }),
    onSave,
    onClose,
  );
  return { ...form, step, setStep, setType };
}
