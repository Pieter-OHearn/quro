import { describe, expect, test } from 'bun:test';
import type { goals } from '../db/schema';
import {
  applyGoalSourceDefaults,
  exceedsGoalDuration,
  mergeGoalPayload,
  parseGoalCreate,
  validateGoalSource,
  validateInvestHabitGoal,
  type GoalPayload,
} from './goals';

const BASE_GOAL: GoalPayload = {
  type: 'savings',
  sourceType: 'savings_account',
  sourceId: 1,
  name: 'Emergency fund',
  emoji: null,
  currentAmount: 0,
  targetAmount: 5000,
  deadline: '2027-12-31',
  year: null,
  category: 'savings',
  monthlyContribution: 100,
  monthlyTarget: null,
  monthsCompleted: null,
  totalMonths: null,
  unit: null,
  color: null,
  notes: null,
  currency: 'EUR',
  startMonth: null,
  missedMonths: null,
};

function p(overrides: Partial<GoalPayload> = {}): GoalPayload {
  return { ...BASE_GOAL, ...overrides };
}

type ExistingGoal = typeof goals.$inferSelect;

function existing(overrides: Partial<ExistingGoal> = {}): ExistingGoal {
  return {
    id: 1,
    userId: 1,
    type: 'savings',
    sourceType: 'savings_account',
    sourceId: 1,
    name: 'Emergency fund',
    emoji: null,
    currentAmount: '0',
    targetAmount: '5000',
    deadline: '2027-12-31',
    year: null,
    category: 'savings',
    monthlyContribution: '100',
    monthlyTarget: null,
    monthsCompleted: null,
    totalMonths: null,
    unit: null,
    color: null,
    notes: null,
    currency: 'EUR',
    startMonth: null,
    missedMonths: null,
    ...overrides,
  };
}

describe('parseGoalCreate', () => {
  test('accepts valid savings goal with savings_account source', () => {
    const result = parseGoalCreate({
      type: 'savings',
      sourceType: 'savings_account',
      sourceId: 1,
      name: 'House deposit',
      emoji: null,
      currentAmount: 0,
      targetAmount: 20000,
      deadline: '2028-01-01',
      year: null,
      category: 'savings',
      monthlyContribution: 500,
      monthlyTarget: null,
      monthsCompleted: null,
      totalMonths: null,
      unit: null,
      color: null,
      notes: null,
      currency: 'EUR',
      startMonth: null,
      missedMonths: null,
    });
    expect(result.ok).toBe(true);
  });

  test('accepts valid salary goal and auto-applies source', () => {
    const result = parseGoalCreate({
      type: 'salary',
      name: 'Target salary',
      emoji: null,
      currentAmount: 50000,
      targetAmount: 70000,
      deadline: '2026-12-31',
      year: null,
      category: 'salary',
      monthlyContribution: 0,
      monthlyTarget: null,
      monthsCompleted: null,
      totalMonths: null,
      unit: null,
      color: null,
      notes: null,
      currency: 'EUR',
      startMonth: null,
      missedMonths: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sourceType).toBe('salary_latest_gross');
  });

  test('accepts valid invest_habit goal', () => {
    const result = parseGoalCreate({
      type: 'invest_habit',
      name: 'Monthly ETF buys',
      emoji: null,
      currentAmount: 0,
      targetAmount: 0,
      deadline: '2027-12-31',
      year: null,
      category: 'investing',
      monthlyContribution: 0,
      monthlyTarget: 200,
      monthsCompleted: 0,
      totalMonths: 36,
      unit: null,
      color: null,
      notes: null,
      currency: 'EUR',
      startMonth: null,
      missedMonths: null,
    });
    expect(result.ok).toBe(true);
  });

  test('accepts valid portfolio goal', () => {
    const result = parseGoalCreate({
      type: 'portfolio',
      name: 'Portfolio target',
      emoji: null,
      currentAmount: 10000,
      targetAmount: 50000,
      deadline: '2030-01-01',
      year: null,
      category: 'investing',
      monthlyContribution: 500,
      monthlyTarget: null,
      monthsCompleted: null,
      totalMonths: null,
      unit: null,
      color: null,
      notes: null,
      currency: 'EUR',
      startMonth: null,
      missedMonths: null,
    });
    expect(result.ok).toBe(true);
  });

  test('accepts valid net_worth goal', () => {
    const result = parseGoalCreate({
      type: 'net_worth',
      name: 'Net worth target',
      emoji: null,
      currentAmount: 0,
      targetAmount: 100000,
      deadline: '2035-01-01',
      year: null,
      category: 'net_worth',
      monthlyContribution: 0,
      monthlyTarget: null,
      monthsCompleted: null,
      totalMonths: null,
      unit: null,
      color: null,
      notes: null,
      currency: 'EUR',
      startMonth: null,
      missedMonths: null,
    });
    expect(result.ok).toBe(true);
  });

  test('accepts valid annual goal with manual source', () => {
    const result = parseGoalCreate({
      type: 'annual',
      sourceType: 'manual',
      sourceId: null,
      name: 'Annual saving target',
      emoji: null,
      currentAmount: 0,
      targetAmount: 12000,
      deadline: '2026-12-31',
      year: 2026,
      category: 'annual',
      monthlyContribution: 0,
      monthlyTarget: null,
      monthsCompleted: null,
      totalMonths: null,
      unit: null,
      color: null,
      notes: null,
      currency: 'EUR',
      startMonth: null,
      missedMonths: null,
    });
    expect(result.ok).toBe(true);
  });

  test('rejects unknown fields', () => {
    const result = parseGoalCreate({ ...BASE_GOAL, unknownField: 'x' });
    expect(result.ok).toBe(false);
  });

  test('rejects non-object body', () => {
    expect(parseGoalCreate(null).ok).toBe(false);
    expect(parseGoalCreate('string').ok).toBe(false);
    expect(parseGoalCreate([]).ok).toBe(false);
  });
});

describe('validateGoalSource', () => {
  test('savings_account accepts savings goal with sourceId', () => {
    expect(validateGoalSource(p())).toBeNull();
  });

  test('savings_account requires sourceId', () => {
    expect(validateGoalSource(p({ sourceId: null }))).not.toBeNull();
  });

  test('savings_account rejects non-savings goal types', () => {
    const src = { sourceType: 'savings_account' as const, sourceId: 1 };
    expect(validateGoalSource(p({ ...src, type: 'salary' }))).not.toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'portfolio' }))).not.toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'net_worth' }))).not.toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'invest_habit' }))).not.toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'annual' }))).not.toBeNull();
  });

  test('salary_latest_gross accepts salary goal without sourceId', () => {
    const payload = p({ type: 'salary', sourceType: 'salary_latest_gross', sourceId: null });
    expect(validateGoalSource(payload)).toBeNull();
  });

  test('salary_latest_gross rejects non-salary goal types', () => {
    const src = { sourceType: 'salary_latest_gross' as const, sourceId: null };
    expect(validateGoalSource(p({ ...src, type: 'savings' }))).not.toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'portfolio' }))).not.toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'annual' }))).not.toBeNull();
  });

  test('portfolio_total accepts portfolio goal, rejects others', () => {
    const src = { sourceType: 'portfolio_total' as const, sourceId: null };
    expect(validateGoalSource(p({ ...src, type: 'portfolio' }))).toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'savings' }))).not.toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'salary' }))).not.toBeNull();
  });

  test('net_worth_total accepts net_worth goal, rejects others', () => {
    const src = { sourceType: 'net_worth_total' as const, sourceId: null };
    expect(validateGoalSource(p({ ...src, type: 'net_worth' }))).toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'savings' }))).not.toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'annual' }))).not.toBeNull();
  });

  test('invest_habit_buys accepts invest_habit goal, rejects others', () => {
    const src = { sourceType: 'invest_habit_buys' as const, sourceId: null };
    expect(validateGoalSource(p({ ...src, type: 'invest_habit' }))).toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'savings' }))).not.toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'portfolio' }))).not.toBeNull();
  });

  test('manual source accepts savings and annual goal types', () => {
    const src = { sourceType: 'manual' as const, sourceId: null };
    expect(validateGoalSource(p({ ...src, type: 'savings' }))).toBeNull();
    expect(validateGoalSource(p({ ...src, type: 'annual' }))).toBeNull();
  });
});

describe('validateInvestHabitGoal', () => {
  test('returns null for non-invest_habit types', () => {
    expect(validateInvestHabitGoal(p({ type: 'savings' }))).toBeNull();
    expect(validateInvestHabitGoal(p({ type: 'portfolio' }))).toBeNull();
    expect(validateInvestHabitGoal(p({ type: 'annual' }))).toBeNull();
  });

  test('requires monthlyTarget greater than zero', () => {
    const base = { type: 'invest_habit' as const, totalMonths: 12 };
    expect(validateInvestHabitGoal(p({ ...base, monthlyTarget: null }))).not.toBeNull();
    expect(validateInvestHabitGoal(p({ ...base, monthlyTarget: 0 }))).not.toBeNull();
  });

  test('requires totalMonths greater than zero', () => {
    const base = { type: 'invest_habit' as const, monthlyTarget: 100 };
    expect(validateInvestHabitGoal(p({ ...base, totalMonths: null }))).not.toBeNull();
  });

  test('returns null when both monthlyTarget and totalMonths are positive', () => {
    expect(
      validateInvestHabitGoal(p({ type: 'invest_habit', monthlyTarget: 100, totalMonths: 12 })),
    ).toBeNull();
  });
});

describe('exceedsGoalDuration', () => {
  test('returns false when monthsCompleted is null', () => {
    expect(exceedsGoalDuration(p({ monthsCompleted: null, totalMonths: 12 }))).toBe(false);
  });

  test('returns false when totalMonths is null', () => {
    expect(exceedsGoalDuration(p({ monthsCompleted: 5, totalMonths: null }))).toBe(false);
  });

  test('returns false when monthsCompleted equals totalMonths', () => {
    expect(exceedsGoalDuration(p({ monthsCompleted: 12, totalMonths: 12 }))).toBe(false);
  });

  test('returns true when monthsCompleted exceeds totalMonths', () => {
    expect(exceedsGoalDuration(p({ monthsCompleted: 13, totalMonths: 12 }))).toBe(true);
    expect(exceedsGoalDuration(p({ monthsCompleted: 6, totalMonths: 5 }))).toBe(true);
  });
});

describe('applyGoalSourceDefaults', () => {
  test('preserves sourceType when key is present in body', () => {
    const payload = p({ type: 'salary', sourceType: 'manual', sourceId: null });
    const result = applyGoalSourceDefaults(payload, { sourceType: 'manual' });
    expect(result.sourceType).toBe('manual');
  });

  test('auto-applies salary_latest_gross for salary goals', () => {
    const result = applyGoalSourceDefaults(
      p({ type: 'salary', sourceType: 'manual', sourceId: null }),
      {},
    );
    expect(result.sourceType).toBe('salary_latest_gross');
    expect(result.sourceId).toBeNull();
  });

  test('auto-applies portfolio_total for portfolio goals', () => {
    const result = applyGoalSourceDefaults(
      p({ type: 'portfolio', sourceType: 'manual', sourceId: null }),
      {},
    );
    expect(result.sourceType).toBe('portfolio_total');
  });

  test('auto-applies net_worth_total for net_worth goals', () => {
    const result = applyGoalSourceDefaults(
      p({ type: 'net_worth', sourceType: 'manual', sourceId: null }),
      {},
    );
    expect(result.sourceType).toBe('net_worth_total');
  });

  test('auto-applies invest_habit_buys for invest_habit goals', () => {
    const result = applyGoalSourceDefaults(
      p({ type: 'invest_habit', sourceType: 'manual', sourceId: null }),
      {},
    );
    expect(result.sourceType).toBe('invest_habit_buys');
  });

  test('leaves savings and annual goals unchanged when sourceType absent', () => {
    const savings = applyGoalSourceDefaults(
      p({ type: 'savings', sourceType: 'manual', sourceId: null }),
      {},
    );
    expect(savings.sourceType).toBe('manual');
    const annual = applyGoalSourceDefaults(
      p({ type: 'annual', sourceType: 'manual', sourceId: null }),
      {},
    );
    expect(annual.sourceType).toBe('manual');
  });
});

describe('mergeGoalPayload', () => {
  test('patching sourceType without sourceId resets sourceId to null', () => {
    const ex = existing({ type: 'savings', sourceType: 'savings_account', sourceId: 1 });
    const result = mergeGoalPayload({ sourceType: 'manual' }, ex);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sourceId).toBeNull();
  });

  test('patching sourceId without sourceType preserves existing sourceType', () => {
    const ex = existing({ type: 'savings', sourceType: 'savings_account', sourceId: 1 });
    const result = mergeGoalPayload({ sourceId: 99 }, ex);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceType).toBe('savings_account');
      expect(result.value.sourceId).toBe(99);
    }
  });

  test('merges name and targetAmount fields', () => {
    const ex = existing({ name: 'Old name', targetAmount: '5000' });
    const result = mergeGoalPayload({ name: 'New name', targetAmount: 8000 }, ex);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('New name');
      expect(result.value.targetAmount).toBe(8000);
    }
  });
});
