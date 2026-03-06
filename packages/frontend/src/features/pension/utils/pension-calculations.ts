import type { PensionPot, PensionTransaction } from '@quro/shared';
import { ANNUAL_GROWTH_RATE, DRAWDOWN_YEARS } from '../constants';
import type { ConvertToBaseFn, DatedPensionTransaction, PensionGrowthPoint } from '../types';

const DECEMBER_INDEX = 11;
const LAST_DAY_OF_MONTH = 31;
const FINAL_HOUR = 23;
const FINAL_MINUTE = 59;
const FINAL_SECOND = 59;
const FINAL_MILLISECOND = 999;
const MIN_GROWTH_POINTS = 2;

export function toUtcTimestamp(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

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
  return txn.type === 'contribution' ? txn.amount : -txn.amount;
}

function buildNetByPotId(pensionTxns: PensionTransaction[]): Map<number, number> {
  const netByPotId = new Map<number, number>();
  for (const txn of pensionTxns) {
    netByPotId.set(txn.potId, (netByPotId.get(txn.potId) ?? 0) + signedPensionTxnAmount(txn));
  }
  return netByPotId;
}

export function computeCurrentPensionBalance(
  pot: PensionPot,
  pensionTxns: PensionTransaction[],
): number {
  const net = pensionTxns.reduce((sum, txn) => {
    if (txn.potId !== pot.id) return sum;
    return sum + signedPensionTxnAmount(txn);
  }, 0);
  return Math.max(0, pot.balance + net);
}

export function computePensionTotals(
  pensions: PensionPot[],
  pensionTxns: PensionTransaction[],
  convertToBase: ConvertToBaseFn,
): { totalInBase: number; totalMonthlyContribInBase: number } {
  const netByPotId = buildNetByPotId(pensionTxns);
  const totalInBase = pensions.reduce((sum, pot) => {
    const currentBalance = Math.max(0, pot.balance + (netByPotId.get(pot.id) ?? 0));
    return sum + convertToBase(currentBalance, pot.currency);
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
  const netByPotId = buildNetByPotId(pensionTxns);

  const currentYear = new Date().getUTCFullYear();
  const earliestYear = new Date(
    Math.min(...datedTxns.map((txn) => txn.timestamp)),
  ).getUTCFullYear();
  const years = Array.from(
    { length: currentYear - earliestYear + 1 },
    (_, index) => earliestYear + index,
  );

  return years.map((year) => {
    const cutoff = year === currentYear ? Date.now() : yearEndUtc(year);

    const total = pensions.reduce((sum, pot) => {
      const currentBalance = Math.max(0, pot.balance + (netByPotId.get(pot.id) ?? 0));
      const netAfterCutoff = datedTxns
        .filter((txn) => txn.potId === pot.id && txn.timestamp > cutoff)
        .reduce((acc, txn) => acc + signedPensionTxnAmount(txn), 0);

      return sum + convertToBase(Math.max(0, currentBalance - netAfterCutoff), pot.currency);
    }, 0);

    return { year: String(year), value: total };
  });
}

export function computePensionGrowthPercent(data: PensionGrowthPoint[]): number | null {
  if (data.length < MIN_GROWTH_POINTS) return null;

  const first = data[0].value;
  const last = data[data.length - 1].value;

  return first <= 0 ? null : ((last - first) / first) * 100;
}
