import { addMonthsUtc, monthStartUtc, toIsoDate } from '@quro/shared';
import { and, eq, getTableColumns, gte } from 'drizzle-orm';
import { db } from '../db/client';
import {
  budgetTransactions,
  debtPayments,
  debts,
  holdingTransactions,
  holdings,
  mortgageTransactions,
  mortgages,
  payslips,
  pensionPots,
  pensionTransactions,
  propertyTransactions,
  properties,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { FX_BASE_CURRENCY } from '../lib/currencyRateCache';

import { ownedOrJointPredicate } from '../lib/partner';
import { toNumberOrZero } from '../lib/numbers';

const BASE_CURRENCY = FX_BASE_CURRENCY;
const ACTIVITY_LOOKBACK_MONTHS = 1;
export function getActivityCutoff(now = new Date()): string {
  const currentMonthStart = monthStartUtc(now.getTime());
  return toIsoDate(new Date(addMonthsUtc(currentMonthStart, -ACTIVITY_LOOKBACK_MONTHS)));
}

function buildCurrencyById(rows: readonly CurrencyRow[]): Map<number, string> {
  const currencies = new Map<number, string>();
  for (const row of rows) {
    currencies.set(row.id, row.currency);
  }
  return currencies;
}

function resolveCurrency(
  currencyById: ReadonlyMap<number, string>,
  id: number,
  fallback = BASE_CURRENCY,
): string {
  return currencyById.get(id) ?? fallback;
}
type CurrencyRow = { id: number; currency: string };
type ActivityRow = { note?: string | null; type: string; amount: unknown; date: string };

type PayslipActivityRow = {
  month: string;
  net: unknown;
  bonus: unknown;
  date: string;
  currency: string;
};

type BudgetActivityRow = {
  description: string;
  amount: unknown;
  date: string;
};

type SavingsActivityRow = ActivityRow & { accountId: number };

type HoldingActivityRow = {
  note?: string | null;
  type: string;
  date: string;
  holdingId: number;
  shares: unknown;
  price: unknown;
};

type MortgageActivityRow = ActivityRow & { mortgageId: number };

type PensionActivityRow = ActivityRow & { potId: number; taxAmount: unknown };

type PropertyActivityRow = ActivityRow & { propertyId: number };

type DebtActivityRow = {
  debtId: number;
  date: string;
  amount: unknown;
  principal: unknown;
  interest: unknown;
  note?: string | null;
};

type ParentAssetInfo = { currency: string; isJoint: boolean };

function buildParentInfoById(
  rows: ReadonlyArray<{ id: number; currency: string; isJoint: boolean }>,
): Map<number, ParentAssetInfo> {
  const infos = new Map<number, ParentAssetInfo>();
  for (const row of rows) {
    infos.set(row.id, { currency: row.currency, isJoint: row.isJoint });
  }
  return infos;
}

function resolveParentInfo(
  infoById: ReadonlyMap<number, ParentAssetInfo>,
  id: number,
): ParentAssetInfo {
  return infoById.get(id) ?? { currency: BASE_CURRENCY, isJoint: false };
}

function mapSavingsTxn(
  row: SavingsActivityRow,
  infoByAccountId: ReadonlyMap<number, ParentAssetInfo>,
) {
  const { currency, isJoint } = resolveParentInfo(infoByAccountId, row.accountId);
  if (row.type === 'interest') {
    return {
      name: row.note || 'Savings interest',
      type: 'income' as const,
      amount: Math.abs(toNumberOrZero(row.amount)),
      date: row.date,
      category: 'Savings',
      currency,
      isJoint,
    };
  }
  const isDeposit = row.type === 'deposit';
  return {
    name: row.note || (isDeposit ? 'Savings deposit' : 'Savings withdrawal'),
    type: 'transfer' as const,
    amount: isDeposit
      ? -Math.abs(toNumberOrZero(row.amount))
      : Math.abs(toNumberOrZero(row.amount)),
    date: row.date,
    category: 'Savings',
    currency,
    isJoint,
  };
}

function mapHoldingTxn(row: HoldingActivityRow, currencyByHoldingId: ReadonlyMap<number, string>) {
  const currency = resolveCurrency(currencyByHoldingId, row.holdingId);
  if (row.type === 'dividend') {
    return {
      name: row.note || 'Dividend',
      type: 'income' as const,
      amount: Math.abs(toNumberOrZero(row.price)),
      date: row.date,
      category: 'Investment',
      currency,
      isJoint: false,
    };
  }
  const gross = toNumberOrZero(row.shares) * toNumberOrZero(row.price);
  const isBuy = row.type === 'buy';
  return {
    name: row.note || (isBuy ? 'Investment buy' : 'Investment sell'),
    type: 'transfer' as const,
    amount: isBuy ? -Math.abs(gross) : Math.abs(gross),
    date: row.date,
    category: 'Investment',
    currency,
    isJoint: false,
  };
}

function mapPropertyTxn(
  row: PropertyActivityRow,
  infoByPropertyId: ReadonlyMap<number, ParentAssetInfo>,
) {
  const { currency, isJoint } = resolveParentInfo(infoByPropertyId, row.propertyId);
  const isIncome = row.type === 'rent_income';
  return {
    name: row.note || (isIncome ? 'Rent income' : 'Property expense'),
    type: isIncome ? ('income' as const) : ('expense' as const),
    amount: isIncome ? Math.abs(toNumberOrZero(row.amount)) : -Math.abs(toNumberOrZero(row.amount)),
    date: row.date,
    category: 'Property',
    currency,
    isJoint,
  };
}

function mapPayslipActivity(row: PayslipActivityRow) {
  return {
    name: `Salary ${row.month}`,
    type: 'income' as const,
    amount: toNumberOrZero(row.net) + toNumberOrZero(row.bonus),
    date: row.date,
    category: 'Salary',
    currency: row.currency,
    isJoint: false,
  };
}

function mapBudgetActivity(row: BudgetActivityRow) {
  return {
    name: row.description,
    type: 'expense' as const,
    amount: -Math.abs(toNumberOrZero(row.amount)),
    date: row.date,
    category: 'Budget',
    currency: BASE_CURRENCY,
    isJoint: false,
  };
}

function mapMortgageTxn(
  row: MortgageActivityRow,
  infoByMortgageId: ReadonlyMap<number, ParentAssetInfo>,
) {
  const { currency, isJoint } = resolveParentInfo(infoByMortgageId, row.mortgageId);
  return {
    name: row.note || 'Mortgage repayment',
    type: 'expense' as const,
    amount: -Math.abs(toNumberOrZero(row.amount)),
    date: row.date,
    category: 'Mortgage',
    currency,
    isJoint,
  };
}

function mapDebtPayment(row: DebtActivityRow, debtCurrencyById: ReadonlyMap<number, string>) {
  return {
    name: row.note || 'Debt payment',
    type: 'expense' as const,
    amount: -Math.abs(toNumberOrZero(row.amount)),
    date: row.date,
    category: 'Debt',
    currency: resolveCurrency(debtCurrencyById, row.debtId),
    isJoint: false,
  };
}

function mapPensionTxn(
  row: PensionActivityRow,
  pensionCurrencyByPotId: ReadonlyMap<number, string>,
) {
  const amount = toNumberOrZero(row.amount);
  const taxAmount = toNumberOrZero(row.taxAmount);
  const currency = resolveCurrency(pensionCurrencyByPotId, row.potId);

  if (row.type === 'contribution') {
    const netAmount = amount - taxAmount;
    return {
      name: row.note || 'Pension contribution',
      type: 'transfer' as const,
      amount: -Math.abs(netAmount),
      date: row.date,
      category: 'Pension',
      currency,
      isJoint: false,
    };
  }

  if (row.type === 'annual_statement') {
    const isGain = amount >= 0;
    return {
      name:
        row.note || (isGain ? 'Pension annual statement gain' : 'Pension annual statement loss'),
      type: isGain ? ('income' as const) : ('expense' as const),
      amount: isGain ? Math.abs(amount) : -Math.abs(amount),
      date: row.date,
      category: 'Pension',
      currency,
      isJoint: false,
    };
  }

  return {
    name: row.note || 'Pension fee',
    type: 'expense' as const,
    amount: -Math.abs(amount),
    date: row.date,
    category: 'Pension',
    currency,
    isJoint: false,
  };
}

export function buildActivityList(
  payslipRows: readonly PayslipActivityRow[],
  budgetRows: readonly BudgetActivityRow[],
  savingsRows: readonly SavingsActivityRow[],
  holdingRows: readonly HoldingActivityRow[],
  mortgageRows: readonly MortgageActivityRow[],
  debtRows: readonly DebtActivityRow[],
  pensionRows: readonly PensionActivityRow[],
  propertyRows: readonly PropertyActivityRow[],
  savingsInfoByAccountId: ReadonlyMap<number, ParentAssetInfo>,
  holdingCurrencyById: ReadonlyMap<number, string>,
  mortgageInfoById: ReadonlyMap<number, ParentAssetInfo>,
  debtCurrencyById: ReadonlyMap<number, string>,
  pensionCurrencyByPotId: ReadonlyMap<number, string>,
  propertyInfoById: ReadonlyMap<number, ParentAssetInfo>,
) {
  return [
    ...payslipRows.map(mapPayslipActivity),
    ...budgetRows.map(mapBudgetActivity),
    ...savingsRows.map((row) => mapSavingsTxn(row, savingsInfoByAccountId)),
    ...holdingRows.map((row) => mapHoldingTxn(row, holdingCurrencyById)),
    ...mortgageRows
      .filter((row) => row.type === 'repayment')
      .map((row) => mapMortgageTxn(row, mortgageInfoById)),
    ...debtRows.map((row) => mapDebtPayment(row, debtCurrencyById)),
    ...pensionRows.map((row) => mapPensionTxn(row, pensionCurrencyByPotId)),
    ...propertyRows
      .filter((row) => row.type === 'rent_income' || row.type === 'expense')
      .map((row) => mapPropertyTxn(row, propertyInfoById)),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((row, index) => ({ id: index + 1, ...row }));
}

type JointScopedActivityRows = {
  savingsTxns: SavingsActivityRow[];
  savingsParents: Array<{ id: number; currency: string; isJoint: boolean }>;
  mortgageTxns: MortgageActivityRow[];
  mortgageParents: Array<{ id: number; currency: string; isJoint: boolean }>;
  propertyTxns: PropertyActivityRow[];
  propertyParents: Array<{ id: number; currency: string; isJoint: boolean }>;
};

async function loadJointScopedActivityRows(
  userId: number,
  cutoff: string,
  partnerId: number | null,
): Promise<JointScopedActivityRows> {
  const savingsAccess = ownedOrJointPredicate(savingsAccounts, userId, partnerId);
  const mortgageAccess = ownedOrJointPredicate(mortgages, userId, partnerId);
  const propertyAccess = ownedOrJointPredicate(properties, userId, partnerId);

  const [
    savingsTxns,
    savingsParents,
    mortgageTxns,
    mortgageParents,
    propertyTxns,
    propertyParents,
  ] = await Promise.all([
    db
      .select(getTableColumns(savingsTransactions))
      .from(savingsTransactions)
      .innerJoin(savingsAccounts, eq(savingsTransactions.accountId, savingsAccounts.id))
      .where(and(savingsAccess, gte(savingsTransactions.date, cutoff))),
    db
      .select({
        id: savingsAccounts.id,
        currency: savingsAccounts.currency,
        isJoint: savingsAccounts.isJoint,
      })
      .from(savingsAccounts)
      .where(savingsAccess),
    db
      .select(getTableColumns(mortgageTransactions))
      .from(mortgageTransactions)
      .innerJoin(mortgages, eq(mortgageTransactions.mortgageId, mortgages.id))
      .where(and(mortgageAccess, gte(mortgageTransactions.date, cutoff))),
    db
      .select({ id: mortgages.id, currency: mortgages.currency, isJoint: mortgages.isJoint })
      .from(mortgages)
      .where(mortgageAccess),
    db
      .select(getTableColumns(propertyTransactions))
      .from(propertyTransactions)
      .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
      .where(and(propertyAccess, gte(propertyTransactions.date, cutoff))),
    db
      .select({ id: properties.id, currency: properties.currency, isJoint: properties.isJoint })
      .from(properties)
      .where(propertyAccess),
  ]);

  return {
    savingsTxns,
    savingsParents,
    mortgageTxns,
    mortgageParents,
    propertyTxns,
    propertyParents,
  };
}

export async function loadActivity(userId: number, partnerId: number | null) {
  const cutoff = getActivityCutoff();
  const [jointScoped, p, b, h, ho, d, doRows, pe, po] = await Promise.all([
    loadJointScopedActivityRows(userId, cutoff, partnerId),
    db
      .select()
      .from(payslips)
      .where(and(eq(payslips.userId, userId), gte(payslips.date, cutoff))),
    db
      .select()
      .from(budgetTransactions)
      .where(and(eq(budgetTransactions.userId, userId), gte(budgetTransactions.date, cutoff))),
    db
      .select()
      .from(holdingTransactions)
      .where(and(eq(holdingTransactions.userId, userId), gte(holdingTransactions.date, cutoff))),
    db
      .select({ id: holdings.id, currency: holdings.currency })
      .from(holdings)
      .where(eq(holdings.userId, userId)),
    db
      .select()
      .from(debtPayments)
      .where(and(eq(debtPayments.userId, userId), gte(debtPayments.date, cutoff))),
    db
      .select({ id: debts.id, currency: debts.currency })
      .from(debts)
      .where(eq(debts.userId, userId)),
    db
      .select()
      .from(pensionTransactions)
      .where(and(eq(pensionTransactions.userId, userId), gte(pensionTransactions.date, cutoff))),
    db
      .select({ id: pensionPots.id, currency: pensionPots.currency })
      .from(pensionPots)
      .where(eq(pensionPots.userId, userId)),
  ]);
  return buildActivityList(
    p,
    b,
    jointScoped.savingsTxns,
    h,
    jointScoped.mortgageTxns,
    d,
    pe,
    jointScoped.propertyTxns,
    buildParentInfoById(jointScoped.savingsParents),
    buildCurrencyById(ho),
    buildParentInfoById(jointScoped.mortgageParents),
    buildCurrencyById(doRows),
    buildCurrencyById(po),
    buildParentInfoById(jointScoped.propertyParents),
  );
}
