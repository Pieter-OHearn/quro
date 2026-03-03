import type { BudgetCategory, BudgetFormatFn, PieEntry } from '../types';
import { BudgetVsSpentChart } from './BudgetVsSpentChart';
import { SpendingPieChart } from './SpendingPieChart';

type BudgetChartsRowProps = {
  pieData: readonly PieEntry[];
  categories: readonly BudgetCategory[];
  fmtDec: BudgetFormatFn;
  fmt: BudgetFormatFn;
};

export function BudgetChartsRow({
  pieData,
  categories,
  fmtDec,
  fmt,
}: Readonly<BudgetChartsRowProps>) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <SpendingPieChart pieData={pieData} fmtDec={fmtDec} />
      <BudgetVsSpentChart categories={categories} fmt={fmt} />
    </div>
  );
}
