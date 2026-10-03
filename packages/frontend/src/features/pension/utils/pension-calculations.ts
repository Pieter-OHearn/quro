import { toUtcTimestamp, type PensionPot, type PensionTransaction } from '@quro/shared';
import { ANNUAL_GROWTH_RATE, DRAWDOWN_YEARS } from '../constants';
import type { ConvertToBaseFn, DatedPensionTransaction, PensionGrowthPoint } from '../types';

const DECEMBER_INDEX = 11;
const LAST_DAY_OF_MONTH = 31;
const FINAL_HOUR = 23;
const FINAL_MINUTE = 59;
const FINAL_SECOND = 59;
const FINAL_MILLISECOND = 999;
const MIN_GROWTH_POINTS = 2;

export function yearEndUtc(year: number): number {
  return Date.UTC(
    year,
    DECEMBER_INDEX,
    LAST_DAY_OF_MONTH,
    FINAL_HOUR,
    FINAL_MINUTE,
    FINAL_SECOND,
    FINAL_MILLISECOND,
  );
}

function signedPensionTxnAmount(txn: Pick<PensionTransaction, 'type' | 'amount'>): number {
  if (txn.type === 'fee') return -txn.amount;
  if (txn.type === 'annual_statement') return txn.amount;
  return txn.amount;
}

function pensionTxnDelta(txn: Pick<PensionTransaction, 'type' | 'amount' | 'taxAmount'>): number {
  if (txn.type === 'contribution') return txn.amount - txn.taxAmount;
  return signedPensionTxnAmount(txn);
}

export function computeCurrentPensionBalance(
  pot: PensionPot,
  _pensionTxns: PensionTransaction[],
): number {
  return Math.max(0, pot.balance);
}

export function computePensionTotals(
  pensions: PensionPot[],
  _pensionTxns: PensionTransaction[],
  convertToBase: ConvertToBaseFn,
): { totalInBase: number; totalMonthlyContribInBase: number } {
  const totalInBase = pensions.reduce((sum, pot) => {
    return sum + convertToBase(Math.max(0, pot.balance), pot.currency);
  }, 0);
  const totalMonthlyContribInBase = pensions.reduce(
    (sum, pot) => sum + convertToBase(pot.employeeMonthly + pot.employerMonthly, pot.currency),
    0,
  );

  return { totalInBase, totalMonthlyContribInBase };
}

export function computeProjectedPensionValue(
  totalInBase: number,
  totalMonthlyContribInBase: number,
  yearsToRetirement: number | null,
): number | null {
  if (yearsToRetirement == null) return null;

  const monthlyGrowthRate = ANNUAL_GROWTH_RATE / 12;
  const projectionMonths = yearsToRetirement * 12;

  return (
    totalInBase * Math.pow(1 + ANNUAL_GROWTH_RATE, yearsToRetirement) +
    totalMonthlyContribInBase *
      ((Math.pow(1 + monthlyGrowthRate, projectionMonths) - 1) / monthlyGrowthRate)
  );
}

export function computeMonthlyDrawdown(projected: number | null): number | null {
  return projected == null ? null : projected / (DRAWDOWN_YEARS * 12);
}

export function computePensionGrowthData(
  pensions: PensionPot[],
  pensionTxns: PensionTransaction[],
  convertToBase: ConvertToBaseFn,
): PensionGrowthPoint[] {
  if (pensions.length === 0 || pensionTxns.length === 0) return [];

  const datedTxns: DatedPensionTransaction[] = pensionTxns
    .map((txn) => ({ ...txn, timestamp: toUtcTimestamp(txn.date) }))
    .filter((txn) => Number.isFinite(txn.timestamp));

  if (datedTxns.length === 0) return [];

  const now = Date.now();
  const currentYear = new Date(now).getUTCFullYear();
  const earliestYear = new Date(
    datedTxns.reduce((earliest, txn) => Math.min(earliest, txn.timestamp), Infinity),
  ).getUTCFullYear();
  const years = Array.from(
    { length: currentYear - earliestYear + 1 },
    (_, index) => earliestYear + index,
  );

  const grouped = new Map<number, DatedPensionTransaction[]>();
  for (const txn of datedTxns) {
    const group = grouped.get(txn.potId);
    if (group) group.push(txn);
    else grouped.set(txn.potId, [txn]);
  }
  const balances = pensions.map((pot) => {
    const txns = (grouped.get(pot.id) ?? []).sort((a, b) => b.timestamp - a.timestamp);
    return { pot, txns, index: 0, netAfterCutoff: 0 };
  });

  // Move the cutoff backwards, consuming each pot's future deltas only once.
  return years
    .reverse()
    .map((year) => {
      const cutoff = year === currentYear ? now : yearEndUtc(year);
      const total = balances.reduce((sum, state) => {
        while (state.index < state.txns.length && state.txns[state.index].timestamp > cutoff) {
          state.netAfterCutoff += pensionTxnDelta(state.txns[state.index]);
          state.index += 1;
        }
        const balance = Math.max(0, Math.max(0, state.pot.balance) - state.netAfterCutoff);
        return sum + convertToBase(balance, state.pot.currency);
      }, 0);
      return { year: String(year), value: total };
    })
    .reverse();
}

export function computePensionGrowthPercent(data: PensionGrowthPoint[]): number | null {
  if (data.length < MIN_GROWTH_POINTS) return null;

  const first = data[0].value;
  const last = data[data.length - 1].value;

  return first <= 0 ? null : ((last - first) / first) * 100;
}
