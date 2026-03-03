import { useMemo, useState } from 'react';
import type { Payslip } from '@quro/shared';
import { Loader2 } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  AddPayslipModal,
  PayBreakdownPanel,
  PayslipHistoryTable,
  PensionTrackerLink,
  SalaryHistoryChart,
  SalaryStatsCards,
} from './components';
import { useCreatePayslip, useDeletePayslip, usePayslips, useSalaryHistory } from './hooks';
import { buildSalaryStatCards, computeSalaryMetrics } from './utils/salary-data';

function useSalaryData() {
  const { data: payslips = [], isLoading: loadingPayslips } = usePayslips();
  const { data: salaryHistory = [], isLoading: loadingHistory } = useSalaryHistory();
  const createPayslip = useCreatePayslip();
  const deletePayslip = useDeletePayslip();

  const metrics = useMemo(
    () => computeSalaryMetrics(payslips, salaryHistory),
    [payslips, salaryHistory],
  );

  return {
    payslips,
    createPayslip,
    deletePayslip,
    isLoading: loadingPayslips || loadingHistory,
    ...metrics,
  };
}

export function Salary() {
  const { fmtBase, baseCurrency } = useCurrency();
  const {
    payslips,
    createPayslip,
    deletePayslip,
    isLoading,
    annualGross,
    annualNet,
    annualTax,
    annualPension,
    salaryChartData,
    salaryGrowthPct,
  } = useSalaryData();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = payslips.find((payslip) => payslip.id === selectedId) ?? payslips[0] ?? null;

  const statCards = useMemo(
    () => buildSalaryStatCards(fmtBase, annualGross, annualNet, annualTax, annualPension),
    [fmtBase, annualGross, annualNet, annualTax, annualPension],
  );

  const handleAdd = (payslip: Omit<Payslip, 'id'>) => {
    createPayslip.mutate(payslip);
  };

  const handleDelete = (id: number) => {
    deletePayslip.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {showAdd && (
        <AddPayslipModal
          onClose={() => setShowAdd(false)}
          onSave={handleAdd}
          baseCurrency={baseCurrency}
        />
      )}

      <SalaryStatsCards cards={statCards} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PayBreakdownPanel selected={selected} fmtBase={fmtBase} />
        <SalaryHistoryChart
          data={salaryChartData}
          growthPct={salaryGrowthPct}
          fmtBase={fmtBase}
          baseCurrency={baseCurrency}
        />
      </div>

      <PayslipHistoryTable
        payslips={payslips}
        selected={selected}
        fmtBase={fmtBase}
        onSelect={setSelectedId}
        onAdd={() => setShowAdd(true)}
        onDelete={handleDelete}
      />

      <PensionTrackerLink />
    </div>
  );
}
