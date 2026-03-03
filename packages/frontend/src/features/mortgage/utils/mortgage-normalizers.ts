import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function normalizeMortgage(raw: MortgageType): MortgageType {
  return {
    ...raw,
    originalAmount: toNumber(raw.originalAmount),
    outstandingBalance: toNumber(raw.outstandingBalance),
    propertyValue: toNumber(raw.propertyValue),
    monthlyPayment: toNumber(raw.monthlyPayment),
    interestRate: toNumber(raw.interestRate),
    termYears: toNumber(raw.termYears),
    overpaymentLimit: toNumber(raw.overpaymentLimit),
  };
}

export function normalizeMortgageTransaction(raw: MortgageTransaction): MortgageTransaction {
  return {
    ...raw,
    amount: toNumber(raw.amount),
    interest: raw.interest == null ? null : toNumber(raw.interest),
    principal: raw.principal == null ? null : toNumber(raw.principal),
    fixedYears: raw.fixedYears == null ? null : toNumber(raw.fixedYears),
  };
}
