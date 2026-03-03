import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Edit3,
  Home,
  Plus,
  TrendingDown,
  Percent,
} from 'lucide-react';
import { EmptyState, LoadingSpinner, StatCard } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import type { Mortgage as MortgageType, MortgageTransaction, Property } from '@quro/shared';
import {
  useMortgages,
  useMortgageTransactions,
  useCreateMortgage,
  useUpdateMortgage,
  useCreateMortgageTransaction,
  useDeleteMortgageTransaction,
  type CreateMortgagePayload,
  type UpdateMortgagePayload,
} from './hooks';
import { useProperties } from '../investments/hooks';
import { AddMortgageModal, type MortgageFormPayload } from './components/AddMortgageModal';
import { AddMortgageTxnModal } from './components/AddMortgageTxnModal';
import { MortgageTxnHistory } from './components/MortgageTxnHistory';

const SCHEDULE_START_YEAR = 2026;
const SCHEDULE_END_YEAR = 2047;
const SCHEDULE_YEAR_STEP = 2;
const GOOD_LTV_THRESHOLD = 70;
const MONTHS_PER_YEAR = 12;
const PAYMENT_BREAKDOWN_LIMIT = 6;
const ISO_YEAR_MONTH_LENGTH = 7;

function generateSchedule(balance: number, rate: number, monthlyPayment: number) {
  const schedule = [];
  const monthlyRate = rate / 100 / 12;
  for (let year = SCHEDULE_START_YEAR; year <= SCHEDULE_END_YEAR; year += SCHEDULE_YEAR_STEP) {
    const interest = balance * monthlyRate * 12;
    const principal = monthlyPayment * 12 - interest;
    balance = Math.max(0, balance - principal);
    schedule.push({
      year: year.toString(),
      balance: Math.round(balance),
      principal: Math.round(principal),
      interest: Math.round(interest),
    });
    if (balance === 0) break;
  }
  return schedule;
}

type MortgagePageState = {
  fmt: (n: number) => string;
  mortgages: MortgageType[];
  properties: Property[];
  mortgage: MortgageType | undefined;
  txns: MortgageTransaction[];
  showTxnModal: boolean;
  setShowTxnModal: (v: boolean) => void;
  showMortgageModal: boolean;
  setShowMortgageModal: (v: boolean) => void;
  editingMortgage: MortgageType | null;
  setEditingMortgage: (v: MortgageType | null) => void;
  editingLinkedPropertyId: number | null;
  setActiveMortgageId: (id: number | null) => void;
  handleAddTxn: (transaction: Omit<MortgageTransaction, 'id'>) => void;
  handleSaveMortgage: (payload: MortgageFormPayload) => Promise<void>;
  handleDeleteTxn: (id: number) => void;
  closeMortgageModal: () => void;
};

function buildLinkedPropertyMap(properties: Property[]): Map<number, Property> {
  const map = new Map<number, Property>();
  for (const property of properties) {
    if (property.mortgageId != null) map.set(property.mortgageId, property);
  }
  return map;
}

function useMortgageModals() {
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showMortgageModal, setShowMortgageModal] = useState(false);
  const [editingMortgage, setEditingMortgage] = useState<MortgageType | null>(null);
  const closeMortgageModal = () => {
    setShowMortgageModal(false);
    setEditingMortgage(null);
  };
  return {
    showTxnModal,
    setShowTxnModal,
    showMortgageModal,
    setShowMortgageModal,
    editingMortgage,
    setEditingMortgage,
    closeMortgageModal,
  };
}

function useMortgagePageState(): MortgagePageState & { isLoading: boolean } {
  const { fmtBase: fmt } = useCurrency();
  const { data: mortgages = [], isLoading: loadingMortgages } = useMortgages();
  const { data: properties = [], isLoading: loadingProperties } = useProperties();
  const [activeMortgageId, setActiveMortgageId] = useState<number | null>(null);
  const mortgage = mortgages.find((entry) => entry.id === activeMortgageId) ?? mortgages[0];
  const { data: txns = [], isLoading: loadingTxns } = useMortgageTransactions(mortgage?.id);
  const createMortgageMut = useCreateMortgage();
  const updateMortgageMut = useUpdateMortgage();
  const createTxn = useCreateMortgageTransaction();
  const deleteTxnMut = useDeleteMortgageTransaction();
  const modals = useMortgageModals();
  const linkedPropertyByMortgageId = useMemo(
    () => buildLinkedPropertyMap(properties),
    [properties],
  );
  const editingLinkedPropertyId = modals.editingMortgage
    ? (linkedPropertyByMortgageId.get(modals.editingMortgage.id)?.id ?? null)
    : null;
  const handleAddTxn = (transaction: Omit<MortgageTransaction, 'id'>) =>
    createTxn.mutate(transaction);
  const handleDeleteTxn = (id: number) => deleteTxnMut.mutate(id);

  async function handleSaveMortgage(payload: MortgageFormPayload) {
    const { id, ...body } = payload;
    if (typeof id === 'number') {
      const updated = await updateMortgageMut.mutateAsync({ ...body, id } as UpdateMortgagePayload);
      setActiveMortgageId((updated as MortgageType).id);
      return;
    }
    const created = await createMortgageMut.mutateAsync(body as CreateMortgagePayload);
    setActiveMortgageId((created as MortgageType).id);
  }

  return {
    fmt,
    mortgages,
    properties,
    mortgage,
    txns,
    ...modals,
    editingLinkedPropertyId,
    setActiveMortgageId,
    handleAddTxn,
    handleSaveMortgage,
    handleDeleteTxn,
    isLoading: [loadingMortgages, loadingProperties, loadingTxns].some(Boolean),
  };
}

type ModalsProps = {
  showTxnModal: boolean;
  showMortgageModal: boolean;
  mortgage: MortgageType;
  editingMortgage: MortgageType | null;
  properties: Property[];
  editingLinkedPropertyId: number | null;
  onCloseTxnModal: () => void;
  onCloseMortgageModal: () => void;
  onSaveTxn: (t: Omit<MortgageTransaction, 'id'>) => void;
  onSaveMortgage: (payload: MortgageFormPayload) => Promise<void>;
};

function MortgageModals({
  showTxnModal,
  showMortgageModal,
  mortgage,
  editingMortgage,
  properties,
  editingLinkedPropertyId,
  onCloseTxnModal,
  onCloseMortgageModal,
  onSaveTxn,
  onSaveMortgage,
}: Readonly<ModalsProps>) {
  return (
    <>
      {showTxnModal && (
        <AddMortgageTxnModal mortgage={mortgage} onClose={onCloseTxnModal} onSave={onSaveTxn} />
      )}
      {showMortgageModal && (
        <AddMortgageModal
          existing={editingMortgage ?? undefined}
          properties={properties}
          linkedPropertyId={editingLinkedPropertyId}
          onClose={onCloseMortgageModal}
          onSave={onSaveMortgage}
        />
      )}
    </>
  );
}

type TabSelectorProps = {
  mortgages: MortgageType[];
  activeMortgage: MortgageType;
  onSelect: (id: number | null) => void;
  onAddClick: () => void;
};

function MortgageTabSelector({
  mortgages,
  activeMortgage,
  onSelect,
  onAddClick,
}: Readonly<TabSelectorProps>) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {mortgages.map((entry) => (
        <button
          key={entry.id}
          onClick={() => onSelect(entry.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
            activeMortgage.id === entry.id
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          <Home size={13} />
          <span className="max-w-[180px] truncate">{entry.propertyAddress.split(',')[0]}</span>
        </button>
      ))}
      <button
        onClick={onAddClick}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 text-sm font-medium transition-all"
      >
        <Plus size={14} /> Add Mortgage
      </button>
    </div>
  );
}

type HeroCardProps = {
  mortgage: MortgageType;
  fmt: (n: number) => string;
  yearsRemaining: number;
  monthsRemaining: number;
  onEdit: () => void;
};

function buildMortgageMetrics(
  mortgage: MortgageType,
  fmt: (n: number) => string,
  yearsRemaining: number,
  monthsRemaining: number,
) {
  return [
    {
      label: 'Outstanding Balance',
      value: fmt(mortgage.outstandingBalance),
      sub: `of ${fmt(mortgage.originalAmount)} original`,
    },
    { label: 'Monthly Payment', value: fmt(mortgage.monthlyPayment), sub: 'Capital + Interest' },
    {
      label: 'Interest Rate',
      value: `${mortgage.interestRate}%`,
      sub: `${mortgage.rateType} (until ${mortgage.fixedUntil})`,
    },
    { label: 'Years Remaining', value: `${yearsRemaining} yrs`, sub: `~${monthsRemaining} months` },
  ];
}

function MortgageHeroCard(props: Readonly<HeroCardProps>) {
  const { mortgage, fmt, yearsRemaining, monthsRemaining, onEdit } = props;
  const metrics = buildMortgageMetrics(mortgage, fmt, yearsRemaining, monthsRemaining);
  return (
    <div className="bg-gradient-to-br from-[#0a0f1e] to-[#1a2040] rounded-2xl p-6 text-white">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <Home size={22} />
          </div>
          <div>
            <h2 className="font-bold text-lg">{mortgage.propertyAddress}</h2>
            <p className="text-slate-400 text-sm">
              {mortgage.lender} · {mortgage.rateType} Rate · Fixed until {mortgage.fixedUntil}
            </p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-xl transition-all flex-shrink-0"
        >
          <Edit3 size={12} /> Edit
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metrics.map(({ label, value, sub }) => (
          <div key={label} className="bg-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className="font-bold text-white">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type StatCardsProps = {
  mortgage: MortgageType;
  fmt: (n: number) => string;
  equity: number;
  ltv: number;
  paid: number;
  paidPct: number;
};

function MortgageStatCards({
  mortgage,
  fmt,
  equity,
  ltv,
  paid,
  paidPct,
}: Readonly<StatCardsProps>) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Property Value"
        value={fmt(mortgage.propertyValue)}
        subtitle={`+${fmt(mortgage.propertyValue - mortgage.originalAmount)} since purchase`}
        icon={Home}
        color="emerald"
      />
      <StatCard
        label="Equity Built"
        value={fmt(equity)}
        subtitle={`${((equity / mortgage.propertyValue) * 100).toFixed(0)}% of property value`}
        icon={TrendingDown}
        color="indigo"
      />
      <StatCard
        label="Loan-to-Value"
        value={`${ltv.toFixed(1)}%`}
        subtitle={ltv < GOOD_LTV_THRESHOLD ? `Good — below ${GOOD_LTV_THRESHOLD}%` : 'High LTV'}
        icon={Percent}
        color="sky"
      />
      <StatCard
        label="Capital Repaid"
        value={fmt(paid)}
        subtitle={`${paidPct.toFixed(0)}% of original loan`}
        icon={Calendar}
        color="amber"
      />
    </div>
  );
}

type RepaymentProgressProps = {
  mortgage: MortgageType;
  fmt: (n: number) => string;
  paid: number;
  paidPct: number;
};

function MortgageRepaymentProgress({
  mortgage,
  fmt,
  paid,
  paidPct,
}: Readonly<RepaymentProgressProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900">Mortgage Repayment Progress</h3>
        <span className="text-sm font-semibold text-indigo-600">
          {paidPct.toFixed(1)}% paid off
        </span>
      </div>
      <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
          style={{ width: `${paidPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>
          {fmt(0)} ({mortgage.startDate})
        </span>
        <span className="text-indigo-600 font-medium">{fmt(paid)} repaid</span>
        <span>
          {fmt(mortgage.originalAmount)} ({mortgage.endDate})
        </span>
      </div>
    </div>
  );
}

type AmortizationRow = { year: string; balance: number; principal: number; interest: number };
type PaymentBreakdownRow = { month: string; principal: number; interest: number };
type OverpaymentImpact = {
  annualAllowance: number;
  extraMonthly: number;
  interestSaved: number;
  monthsReduced: number;
};

function calculateRemainingMonths(
  balance: number,
  monthlyRate: number,
  monthlyPayment: number,
): number | null {
  const inputs = [balance, monthlyRate, monthlyPayment];
  if (inputs.some((value) => !Number.isFinite(value))) return null;
  if (balance <= 0 || monthlyPayment <= 0) return null;
  if (monthlyRate <= 0) return balance / monthlyPayment;

  const ratio = 1 - (balance * monthlyRate) / monthlyPayment;
  if (!(ratio > 0 && ratio < 1)) return null;

  const months = -Math.log(ratio) / Math.log(1 + monthlyRate);
  if (!(Number.isFinite(months) && months > 0)) return null;
  return months;
}

function computePaymentBreakdownRows(txns: MortgageTransaction[]): PaymentBreakdownRow[] {
  const byMonth = new Map<string, { principal: number; interest: number; timestamp: number }>();

  for (const txn of txns) {
    if (txn.type !== 'repayment') continue;
    const monthKey = txn.date.slice(0, ISO_YEAR_MONTH_LENGTH);
    const monthTimestamp = Date.parse(`${monthKey}-01T00:00:00Z`);
    if (!Number.isFinite(monthTimestamp)) continue;

    const interest = txn.interest ?? 0;
    const principal = txn.principal ?? Math.max(0, txn.amount - interest);
    const month = byMonth.get(monthKey) ?? { principal: 0, interest: 0, timestamp: monthTimestamp };
    month.principal += principal;
    month.interest += interest;
    byMonth.set(monthKey, month);
  }

  return [...byMonth.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-PAYMENT_BREAKDOWN_LIMIT)
    .map((month) => ({
      month: new Date(month.timestamp).toLocaleDateString('en-GB', { month: 'short' }),
      principal: Math.round(month.principal),
      interest: Math.round(month.interest),
    }));
}

function computeOverpaymentImpact(
  mortgage: MortgageType,
  monthlyRate: number,
  monthsRemainingRaw: number | null,
): OverpaymentImpact | null {
  if (monthsRemainingRaw == null) return null;
  const annualAllowance = (mortgage.outstandingBalance * mortgage.overpaymentLimit) / 100;
  if (!Number.isFinite(annualAllowance) || annualAllowance <= 0) return null;

  const extraMonthly = annualAllowance / MONTHS_PER_YEAR;
  const acceleratedPayment = mortgage.monthlyPayment + extraMonthly;
  const acceleratedMonthsRaw = calculateRemainingMonths(
    mortgage.outstandingBalance,
    monthlyRate,
    acceleratedPayment,
  );
  if (acceleratedMonthsRaw == null) return null;

  const baselineInterest =
    mortgage.monthlyPayment * monthsRemainingRaw - mortgage.outstandingBalance;
  const acceleratedInterest =
    acceleratedPayment * acceleratedMonthsRaw - mortgage.outstandingBalance;
  return {
    annualAllowance,
    extraMonthly,
    interestSaved: Math.max(0, baselineInterest - acceleratedInterest),
    monthsReduced: Math.max(0, Math.round(monthsRemainingRaw - acceleratedMonthsRaw)),
  };
}

function formatTermReduction(monthsReduced: number): string {
  if (monthsReduced < MONTHS_PER_YEAR) {
    return `${monthsReduced} month${monthsReduced === 1 ? '' : 's'}`;
  }
  return `${(monthsReduced / MONTHS_PER_YEAR).toFixed(1)} years`;
}

type ChartsProps = {
  fmt: (n: number) => string;
  amortization: AmortizationRow[];
  paymentBreakdown: PaymentBreakdownRow[];
};

function MortgageBalanceChart({
  amortization,
  fmt,
}: Readonly<{ amortization: AmortizationRow[]; fmt: (n: number) => string }>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Balance Projection</h3>
      <p className="text-xs text-slate-400 mb-5">Remaining balance over loan term</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={amortization}>
          <defs>
            <linearGradient id="mortGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(v: number) => [fmt(v), 'Balance']}
            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#6366f1"
            strokeWidth={2.5}
            fill="url(#mortGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PaymentChartLegend() {
  return (
    <div className="flex items-center gap-5 mt-3">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-indigo-500" />
        <span className="text-xs text-slate-500">Principal</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-amber-400" />
        <span className="text-xs text-slate-500">Interest</span>
      </div>
    </div>
  );
}

function MortgagePaymentChart({
  paymentBreakdown,
  fmt,
}: Readonly<{ paymentBreakdown: PaymentBreakdownRow[]; fmt: (n: number) => string }>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Payment Breakdown</h3>
      <p className="text-xs text-slate-400 mb-5">Principal vs Interest per month</p>
      {paymentBreakdown.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={paymentBreakdown} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
                formatter={(v: number, name) => [
                  fmt(v),
                  name === 'principal' ? 'Principal' : 'Interest',
                ]}
              />
              <Bar
                dataKey="principal"
                name="principal"
                fill="#6366f1"
                stackId="a"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="interest"
                name="interest"
                fill="#f59e0b"
                stackId="a"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <PaymentChartLegend />
        </>
      ) : (
        <div className="flex items-center justify-center py-12 text-sm text-slate-400">
          No repayment transactions yet.
        </div>
      )}
    </div>
  );
}

function MortgageCharts({ fmt, amortization, paymentBreakdown }: Readonly<ChartsProps>) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <MortgageBalanceChart amortization={amortization} fmt={fmt} />
      <MortgagePaymentChart paymentBreakdown={paymentBreakdown} fmt={fmt} />
    </div>
  );
}

type TipsProps = {
  mortgage: MortgageType;
  fmt: (n: number) => string;
  overpaymentImpact: OverpaymentImpact | null;
};

function MortgageTips({ mortgage, fmt, overpaymentImpact }: Readonly<TipsProps>) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
        <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Rate Fix Expiry Coming</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Your fixed rate of {mortgage.interestRate}% expires in {mortgage.fixedUntil}. Start
            comparing remortgage deals 6 months before to avoid the Standard Variable Rate.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
        <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Overpayment Opportunity</p>
          <p className="text-xs text-emerald-700 mt-0.5">
            You can overpay up to {mortgage.overpaymentLimit}% (
            {fmt((mortgage.outstandingBalance * mortgage.overpaymentLimit) / 100)}) per year without
            penalty.
            {overpaymentImpact
              ? ` Spreading that allowance as ${fmt(overpaymentImpact.extraMonthly)}/month could save approximately ${fmt(overpaymentImpact.interestSaved)} in interest and reduce your term by ${formatTermReduction(overpaymentImpact.monthsReduced)}.`
              : ' Add complete mortgage payment details to estimate overpayment impact.'}
          </p>
        </div>
      </div>
    </div>
  );
}

const computeMortgageMetrics = (mortgage: MortgageType, txns: MortgageTransaction[]) => {
  const monthlyRate = mortgage.interestRate / 100 / 12;
  const monthsRemainingRaw = calculateRemainingMonths(
    mortgage.outstandingBalance,
    monthlyRate,
    mortgage.monthlyPayment,
  );
  const monthsRemaining = Math.round(monthsRemainingRaw ?? 0);
  const paid = mortgage.originalAmount - mortgage.outstandingBalance;
  const paymentBreakdown = computePaymentBreakdownRows(txns);
  const overpaymentImpact = computeOverpaymentImpact(mortgage, monthlyRate, monthsRemainingRaw);
  return {
    ltv: (mortgage.outstandingBalance / mortgage.propertyValue) * 100,
    equity: mortgage.propertyValue - mortgage.outstandingBalance,
    paid,
    paidPct: (paid / mortgage.originalAmount) * 100,
    monthsRemaining,
    yearsRemaining: Math.floor(monthsRemaining / 12),
    amortization: generateSchedule(
      mortgage.outstandingBalance,
      mortgage.interestRate,
      mortgage.monthlyPayment,
    ),
    paymentBreakdown,
    overpaymentImpact,
  };
};

type MortgagePageStateAll = ReturnType<typeof useMortgagePageState>;

function MortgagePageTopControls({ s }: Readonly<{ s: MortgagePageStateAll }>) {
  return (
    <>
      <MortgageModals
        showTxnModal={s.showTxnModal}
        showMortgageModal={s.showMortgageModal}
        mortgage={s.mortgage!}
        editingMortgage={s.editingMortgage}
        properties={s.properties}
        editingLinkedPropertyId={s.editingLinkedPropertyId}
        onCloseTxnModal={() => s.setShowTxnModal(false)}
        onCloseMortgageModal={s.closeMortgageModal}
        onSaveTxn={s.handleAddTxn}
        onSaveMortgage={s.handleSaveMortgage}
      />
      <MortgageTabSelector
        mortgages={s.mortgages}
        activeMortgage={s.mortgage!}
        onSelect={s.setActiveMortgageId}
        onAddClick={() => {
          s.setEditingMortgage(null);
          s.setShowMortgageModal(true);
        }}
      />
    </>
  );
}

function MortgagePageContent({ s }: Readonly<{ s: MortgagePageStateAll }>) {
  const {
    ltv,
    equity,
    paid,
    paidPct,
    monthsRemaining,
    yearsRemaining,
    amortization,
    paymentBreakdown,
    overpaymentImpact,
  } = computeMortgageMetrics(s.mortgage!, s.txns);
  return (
    <div className="p-6 space-y-6">
      <MortgagePageTopControls s={s} />
      <MortgageHeroCard
        mortgage={s.mortgage!}
        fmt={s.fmt}
        yearsRemaining={yearsRemaining}
        monthsRemaining={monthsRemaining}
        onEdit={() => {
          s.setEditingMortgage(s.mortgage!);
          s.setShowMortgageModal(true);
        }}
      />
      <MortgageStatCards
        mortgage={s.mortgage!}
        fmt={s.fmt}
        equity={equity}
        ltv={ltv}
        paid={paid}
        paidPct={paidPct}
      />
      <MortgageRepaymentProgress mortgage={s.mortgage!} fmt={s.fmt} paid={paid} paidPct={paidPct} />
      <MortgageCharts fmt={s.fmt} amortization={amortization} paymentBreakdown={paymentBreakdown} />
      <MortgageTxnHistory
        mortgage={s.mortgage!}
        transactions={s.txns}
        onAdd={() => s.setShowTxnModal(true)}
        onDelete={s.handleDeleteTxn}
      />
      <MortgageTips mortgage={s.mortgage!} fmt={s.fmt} overpaymentImpact={overpaymentImpact} />
    </div>
  );
}

export function Mortgage() {
  const state: MortgagePageStateAll = useMortgagePageState();
  const {
    properties,
    isLoading,
    showMortgageModal,
    setShowMortgageModal,
    handleSaveMortgage,
    closeMortgageModal,
  } = state;
  const mortgage = state.mortgage;

  if (isLoading) return <LoadingSpinner className="min-h-[256px]" />;

  if (!mortgage) {
    return (
      <div className="p-6">
        {showMortgageModal && (
          <AddMortgageModal
            properties={properties}
            linkedPropertyId={null}
            onClose={closeMortgageModal}
            onSave={handleSaveMortgage}
          />
        )}
        <div className="min-h-[70vh] flex items-center justify-center">
          <EmptyState
            icon={Home}
            title="No mortgages yet"
            description="Add a property first, then create a mortgage linked to that property."
            action={{
              label: properties.length === 0 ? 'Add Property First' : 'Set Up Mortgage',
              onClick: () => setShowMortgageModal(true),
            }}
          />
        </div>
      </div>
    );
  }

  return <MortgagePageContent s={state} />;
}
