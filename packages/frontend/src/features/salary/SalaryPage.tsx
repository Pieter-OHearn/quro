import { useEffect, useMemo, useState } from 'react';
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
import {
  buildSalaryStatCards,
  computeSalaryMetrics,
  computeSalaryYears,
  parsePayslipYear,
} from './utils/salary-data';

function useSalaryData() {
  const { data: payslips = [], isLoading: loadingPayslips } = usePayslips();
  const { data: salaryHistory = [], isLoading: loadingHistory } = useSalaryHistory();
  const createPayslip = useCreatePayslip();
  const deletePayslip = useDeletePayslip();

  return {
    payslips,
    salaryHistory,
    createPayslip,
    deletePayslip,
    isLoading: loadingPayslips || loadingHistory,
  };
}

function useSalaryPageState() {
  const { fmtBase, baseCurrency, convertToBase } = useCurrency();
  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState(currentYear);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { payslips, salaryHistory, createPayslip, deletePayslip, isLoading } = useSalaryData();

  const years = useMemo(() => computeSalaryYears(payslips, currentYear), [payslips, currentYear]);

  useEffect(() => {
    if (!years.includes(activeYear)) {
      setActiveYear(years[years.length - 1] ?? currentYear);
    }
  }, [activeYear, years, currentYear]);

  const yearPayslips = useMemo(
    () => payslips.filter((payslip) => parsePayslipYear(payslip, currentYear) === activeYear),
    [payslips, activeYear, currentYear],
  );

  const { annualGross, annualNet, annualTax, annualPension, salaryChartData, salaryGrowthPct } =
    useMemo(
      () => computeSalaryMetrics(yearPayslips, payslips, salaryHistory, convertToBase, currentYear),
      [yearPayslips, payslips, salaryHistory, convertToBase, currentYear],
    );

  const selected =
    yearPayslips.find((payslip) => payslip.id === selectedId) ?? yearPayslips[0] ?? null;

  const statCards = useMemo(
    () =>
      buildSalaryStatCards(
        fmtBase,
        annualGross,
        annualNet,
        annualTax,
        annualPension,
        activeYear,
        currentYear,
      ),
    [fmtBase, annualGross, annualNet, annualTax, annualPension, activeYear, currentYear],
  );

  return {
    fmtBase,
    baseCurrency,
    createPayslip,
    deletePayslip,
    isLoading,
    showAdd,
    setShowAdd,
    selected,
    setSelectedId,
    years,
    activeYear,
    setActiveYear,
    currentYear,
    statCards,
    salaryChartData,
    salaryGrowthPct,
    yearPayslips,
  };
}

export function Salary() {
  const state = useSalaryPageState();

  const handleAdd = (payslip: Omit<Payslip, 'id'>) => {
    state.createPayslip.mutate(payslip);
  };

  const handleDelete = (id: number) => {
    state.deletePayslip.mutate(id);
  };

  if (state.isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {state.showAdd && (
        <AddPayslipModal
          onClose={() => state.setShowAdd(false)}
          onSave={handleAdd}
          baseCurrency={state.baseCurrency}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {state.years.map((year) => (
          <button
            key={year}
            onClick={() => state.setActiveYear(year)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${year === state.activeYear ? 'bg-[#0a0f1e] text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {year}
            {year === state.currentYear && (
              <span className="ml-1.5 text-[10px] opacity-70">current</span>
            )}
          </button>
        ))}
      </div>

      <SalaryStatsCards cards={state.statCards} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PayBreakdownPanel selected={state.selected} fmtBase={state.fmtBase} />
        <SalaryHistoryChart
          data={state.salaryChartData}
          growthPct={state.salaryGrowthPct}
          fmtBase={state.fmtBase}
          baseCurrency={state.baseCurrency}
        />
      </div>

      <PayslipHistoryTable
        payslips={state.yearPayslips}
        selected={state.selected}
        fmtBase={state.fmtBase}
        onSelect={state.setSelectedId}
        onAdd={() => state.setShowAdd(true)}
        onDelete={handleDelete}
      />

      <PensionTrackerLink />
    </div>
  );
}
