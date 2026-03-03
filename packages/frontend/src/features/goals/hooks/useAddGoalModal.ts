import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import type { Goal, GoalType } from '@quro/shared';
import type { CreateGoalInput, GoalFormField, GoalFormState } from '../types';
import { GOAL_TYPE_META, COLORS } from '../utils/goals-constants';
import { buildGoalPayload } from '../utils/goal-utils';

const defaultForm = (): GoalFormState => ({
  name: '',
  emoji: '🎯',
  color: COLORS[0],
  notes: '',
  deadline: 'Dec 2026',
  year: String(new Date().getFullYear()),
  current: '',
  target: '',
  monthlyContrib: '',
  monthlyTarget: '',
  totalMonths: '12',
  unit: '',
});

export function useAddGoalModal(onSave: (goal: CreateGoalInput) => void, onClose: () => void) {
  const { baseCurrency } = useCurrency();
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [type, setType] = useState<GoalType>('savings');
  const [form, setForm] = useState<GoalFormState>(defaultForm);

  const setField = (key: GoalFormField, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = () => {
    if (!form.name.trim()) return;

    const base: Omit<Goal, 'id'> = {
      type,
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
    step,
    type,
    form,
    setField,
    handleSave,
    setType,
    setStep,
  };
}
