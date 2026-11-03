import {
  fromCents,
  goalMonthKey,
  investHabitMonths,
  parseGoalMonth,
  toCents,
  type Goal,
  type GoalMonth,
  type InvestHabitBuyTotal,
} from '@quro/shared';

export type InvestHabitBuys = {
  /** What was bought per `YYYY-MM` month, in base-currency cents. */
  centsByMonth: ReadonlyMap<string, number>;
  /** Months with buys in a currency that has no rate; those buys are not counted. */
  missingRateMonths: ReadonlySet<string>;
};

export type InvestHabitMonthState = 'hit' | 'missed' | 'current' | 'future';

export type InvestHabitMonth = GoalMonth & {
  key: string;
  invested: number;
  state: InvestHabitMonthState;
};

export type InvestHabitProgress = {
  months: readonly InvestHabitMonth[];
  hits: number;
  /** Months that have passed: every month before this one, and this one once its target is hit. */
  dueMonths: number;
  /** A passed month fell short of the target. */
  behind: boolean;
  investedSoFar: number;
  /** The monthly target in the base currency; null when its currency has no rate. */
  monthlyTarget: number | null;
  /** This month's buys, when this month is one of the habit's months. */
  currentMonthInvested: number | null;
  missingRate: boolean;
};

export const EMPTY_INVEST_HABIT_BUYS: InvestHabitBuys = {
  centsByMonth: new Map(),
  missingRateMonths: new Set(),
};

type ConvertToBase = (amount: number, fromCurrency: string) => number;

/** Converts at the current rate (historical rates are not stored); null when there is no rate. */
function tryConvertToBase(amount: number, currency: string, convert: ConvertToBase) {
  try {
    const converted = convert(amount, currency);
    return Number.isFinite(converted) ? converted : null;
  } catch {
    return null;
  }
}

/** Adds each month's buys up in the base currency; a currency without a rate is not counted. */
export function buildInvestHabitBuys(
  totals: readonly InvestHabitBuyTotal[],
  convertToBase: ConvertToBase,
): InvestHabitBuys {
  const centsByMonth = new Map<string, number>();
  const missingRateMonths = new Set<string>();
  for (const total of totals) {
    const converted = tryConvertToBase(total.amount, total.currency, convertToBase);
    if (converted === null) {
      missingRateMonths.add(total.month);
      continue;
    }
    centsByMonth.set(total.month, (centsByMonth.get(total.month) ?? 0) + toCents(converted));
  }
  return { centsByMonth, missingRateMonths };
}

function monthState(key: string, hit: boolean, currentMonth: string): InvestHabitMonthState {
  if (hit) return 'hit';
  if (key < currentMonth) return 'missed';
  return key === currentMonth ? 'current' : 'future';
}

/**
 * An invest habit's months from its start month to its deadline. A month is a hit when the buys
 * dated in it reach the monthly target; months are compared in cents of the base currency.
 */
export function computeInvestHabitProgress(
  goal: Goal,
  buys: InvestHabitBuys,
  convertToBase: ConvertToBase,
  currentMonth: string,
): InvestHabitProgress {
  const fallbackYear = parseGoalMonth(currentMonth)?.year ?? new Date().getFullYear();
  const target = tryConvertToBase(goal.monthlyTarget || 0, goal.currency, convertToBase);
  const targetCents = target === null ? null : toCents(target);
  let investedCents = 0;
  let missingRate = target === null;
  const months = investHabitMonths(goal, fallbackYear).map((month): InvestHabitMonth => {
    const key = goalMonthKey(month);
    const cents = buys.centsByMonth.get(key) ?? 0;
    investedCents += cents;
    if (buys.missingRateMonths.has(key)) missingRate = true;
    const hit = targetCents !== null && targetCents > 0 && cents >= targetCents;
    return { ...month, key, invested: fromCents(cents), state: monthState(key, hit, currentMonth) };
  });
  const passed = months.filter((month) => month.key < currentMonth);
  const current = months.find((month) => month.key === currentMonth);
  return {
    months,
    hits: months.filter((month) => month.state === 'hit').length,
    dueMonths: passed.length + (current?.state === 'hit' ? 1 : 0),
    behind: passed.some((month) => month.state !== 'hit'),
    investedSoFar: fromCents(investedCents),
    monthlyTarget: target,
    currentMonthInvested: current ? current.invested : null,
    missingRate,
  };
}
