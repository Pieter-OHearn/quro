import { useEffect, useMemo, useState } from 'react';
import type { Payslip } from '@quro/shared';
import { RouteQueryErrorState } from '@/components/errors/RouteQueryErrorState';
import { LoadingState, SegmentedControl } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import {
  AddPayslipModal,
  PayBreakdownPanel,
  PayslipHistoryTable,
  PensionTrackerLink,
  SalaryHistoryChart,
  SalaryStatsCards,
} from './components';
import {
  useCreatePayslip,
  useDeletePayslip,
  usePayslips,
  useSalaryHistory,
  useUpdatePayslip,
} from './hooks';
import {
  buildSalaryStatCards,
  computeSalaryMetrics,
  computeSalaryYears,
  parsePayslipYear,
} from './utils/salary-data';
import type { SavePayslipInput } from './types';

function useSalaryData() {
  const payslipsQuery = usePayslips();
  const salaryHistoryQuery = useSalaryHistory();
  const createPayslip = useCreatePayslip();
  const updatePayslip = useUpdatePayslip();
  const deletePayslip = useDeletePayslip();

  return {
    payslips: payslipsQuery.data ?? [],
    salaryHistory: salaryHistoryQuery.data ?? [],
    createPayslip,
    updatePayslip,
    deletePayslip,
    isLoading: payslipsQuery.isLoading || salaryHistoryQuery.isLoading,
    queryFailures: getFailedRouteQueries([
      { label: 'payslips', ...payslipsQuery },
      { label: 'salary history', ...salaryHistoryQuery },
    ]),
  };
}

function useSalaryPageState() {
  const { fmtBase, baseCurrency, convertToBase } = useCurrency();
  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState(currentYear);
  const [showAdd, setShowAdd] = useState(false);
  const [editingPayslip, setEditingPayslip] = useState<Payslip | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const {
    payslips,
    salaryHistory,
    createPayslip,
    updatePayslip,
    deletePayslip,
    isLoading,
    queryFailures,
  } = useSalaryData();

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
    updatePayslip,
    deletePayslip,
    isLoading,
    queryFailures,
    showAdd,
    setShowAdd,
    editingPayslip,
    setEditingPayslip,
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

type SalaryPageState = ReturnType<typeof useSalaryPageState>;

type SalaryPageContentProps = {
  state: SalaryPageState;
  onSave: (payslip: SavePayslipInput) => Promise<Payslip>;
  onDelete: (id: number) => void;
  onCloseModal: () => void;
};

function SalaryPageContent({
  state,
  onSave,
  onDelete,
  onCloseModal,
}: Readonly<SalaryPageContentProps>) {
  return (
    <div className="p-6 space-y-6">
      {(state.showAdd || state.editingPayslip) && (
        <AddPayslipModal
          existing={state.editingPayslip ?? undefined}
          onClose={onCloseModal}
          onSave={onSave}
          onDelete={onDelete}
          baseCurrency={state.baseCurrency}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <SegmentedControl
          options={state.years.map((year) => ({
            value: year,
            label: year,
            badge:
              year === state.currentYear ? (
                <span className="text-[10px] opacity-70">current</span>
              ) : undefined,
          }))}
          value={state.activeYear}
          onChange={state.setActiveYear}
          variant="pill"
          tone="dark"
          buttonClassName="px-5 font-semibold"
        />
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
        onAdd={() => {
          state.setEditingPayslip(null);
          state.setShowAdd(true);
        }}
        onEdit={(payslip) => {
          state.setShowAdd(false);
          state.setEditingPayslip(payslip);
        }}
      />

      <PensionTrackerLink />
    </div>
  );
}

export function Salary() {
  const state = useSalaryPageState();

  const handleSave = (payslip: SavePayslipInput) =>
    state.editingPayslip
      ? state.updatePayslip.mutateAsync({ id: state.editingPayslip.id, payslip })
      : state.createPayslip.mutateAsync(payslip);

  const handleDelete = (id: number) => {
    state.deletePayslip.mutate(id);
    if (state.selected?.id === id) {
      state.setSelectedId(null);
    }
    if (state.editingPayslip?.id === id) {
      state.setEditingPayslip(null);
    }
  };

  const closeModal = () => {
    state.setShowAdd(false);
    state.setEditingPayslip(null);
  };

  if (state.isLoading) {
    return <LoadingState />;
  }

  if (state.queryFailures.length > 0) {
    return <RouteQueryErrorState routeName="Salary" failedQueries={state.queryFailures} />;
  }

  return (
    <SalaryPageContent
      state={state}
      onSave={handleSave}
      onDelete={handleDelete}
      onCloseModal={closeModal}
    />
  );
}
