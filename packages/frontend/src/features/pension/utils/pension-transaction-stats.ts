import type { PensionTransaction } from '@quro/shared';
import type { PensionFormatNativeFn } from '../types';

export function buildPensionTxnStats(
  potTxns: PensionTransaction[],
  currency: string,
  fmtNative: PensionFormatNativeFn,
) {
  const total = potTxns
    .filter((txn) => txn.type === 'contribution')
    .reduce((sum, txn) => sum + (txn.amount - txn.taxAmount), 0);
  const employeeContributions = potTxns
    .filter((txn) => txn.type === 'contribution' && !txn.isEmployer)
    .reduce((sum, txn) => sum + (txn.amount - txn.taxAmount), 0);
  const employerContributions = potTxns
    .filter((txn) => txn.type === 'contribution' && txn.isEmployer)
    .reduce((sum, txn) => sum + (txn.amount - txn.taxAmount), 0);
  const fees = potTxns
    .filter((txn) => txn.type === 'fee')
    .reduce((sum, txn) => sum + txn.amount, 0);
  const annualStatements = potTxns
    .filter((txn) => txn.type === 'annual_statement')
    .reduce((sum, txn) => sum + txn.amount, 0);

  return [
    {
      label: 'Total Contributions',
      value: `+${fmtNative(total, currency, true)}`,
      color: 'text-emerald-600',
    },
    {
      label: 'Employee',
      value: fmtNative(employeeContributions, currency, true),
      color: 'text-slate-800',
    },
    {
      label: 'Employer',
      value: fmtNative(employerContributions, currency, true),
      color: 'text-indigo-600',
    },
    {
      label: 'Total Fees',
      value: `\u2212${fmtNative(fees, currency, true)}`,
      color: 'text-rose-500',
    },
    {
      label: 'Annual Statements',
      value:
        annualStatements >= 0
          ? `+${fmtNative(annualStatements, currency, true)}`
          : `\u2212${fmtNative(Math.abs(annualStatements), currency, true)}`,
      color: annualStatements >= 0 ? 'text-amber-700' : 'text-rose-500',
    },
  ];
}
