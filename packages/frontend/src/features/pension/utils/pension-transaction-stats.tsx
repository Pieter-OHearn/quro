import type { PensionTransaction } from '@quro/shared';
import { Change } from '@/components/ui';
import { TxnAmount } from '@/components/finance/TxnAmount';
import type { PensionFormatNativeFn } from '../types';

function resolveInvestmentResultLabel(amount: number): string {
  if (amount > 0) return 'Investment gain';
  if (amount < 0) return 'Investment loss';
  return 'Investment gain/loss';
}

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
  const format = (amount: number) => fmtNative(amount, currency, true);

  // Contributions and fees are money moving in and out; the statement result is a gain or loss.
  return [
    { label: 'Total contributions', value: <TxnAmount value={total} format={format} /> },
    { label: 'Employee', value: format(employeeContributions) },
    { label: 'Employer', value: format(employerContributions) },
    { label: 'Total fees', value: <TxnAmount value={-fees} format={format} /> },
    {
      label: resolveInvestmentResultLabel(annualStatements),
      value: (
        <Change
          value={annualStatements}
          format="amount"
          currency={currency}
          showArrow={false}
          className="text-figure-md"
        />
      ),
    },
  ];
}
