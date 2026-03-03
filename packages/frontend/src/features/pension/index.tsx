import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ShieldCheck,
  Plus,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
  TrendingUp,
  Calendar,
  Clock,
} from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import {
  usePensionPots,
  usePensionTransactions,
  useCreatePensionPot,
  useUpdatePensionPot,
  useDeletePensionPot,
  useCreatePensionTransaction,
  useDeletePensionTransaction,
} from './hooks';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatCard } from '@/components/ui/StatCard';
import { AddPensionTxnModal } from './components/AddPensionTxnModal';
import { PensionModal } from './components/PensionModal';
import { PensionTxnHistory } from './components/PensionTxnHistory';
import {
  TYPE_COLORS,
  toUtcTimestamp,
  yearEndUtc,
  ANNUAL_GROWTH_RATE,
  DRAWDOWN_YEARS,
  type DatedPensionTransaction,
} from './constants';

// ─── Hook ────────────────────────────────────────────────────────────────────

type PensionPageState = {
  fmtBase: (n: number) => string;
  fmtNative: (n: number, currency: string) => string;
  convertToBase: (n: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
  baseCurrency: string;
  pensions: PensionPot[];
  pensionTxns: PensionTransaction[];
  isLoading: boolean;
  showModal: boolean;
  setShowModal: (v: boolean) => void;
  editing: PensionPot | undefined;
  setEditing: (v: PensionPot | undefined) => void;
  expanded: number | null;
  setExpanded: (v: number | null) => void;
  addTxnForPot: PensionPot | null;
  setAddTxnForPot: (v: PensionPot | null) => void;
  totalInBase: number;
  totalMonthlyContribInBase: number;
  projected: number | null;
  monthlyDrawdown: number | null;
  yearsToRetirement: number | null;
  retirementYearsInput: string;
  setRetirementYearsInput: (v: string) => void;
  pensionGrowthData: { year: string; value: number }[];
  pensionGrowthPct: number | null;
  handleSave: (pot: PensionPot | Omit<PensionPot, 'id'>) => void;
  handleAddPensionTxn: (t: Omit<PensionTransaction, 'id'>) => void;
  handleDeletePensionTxn: (id: number) => void;
  deletePot: { mutate: (id: number) => void };
};

const computePensionGrowthData = (
  pensions: PensionPot[],
  pensionTxns: PensionTransaction[],
  convertToBase: (n: number, currency: string) => number,
): { year: string; value: number }[] => {
  if (pensions.length === 0 || pensionTxns.length === 0) return [];
  const datedTxns: DatedPensionTransaction[] = pensionTxns
    .map((txn) => ({ ...txn, timestamp: toUtcTimestamp(txn.date) }))
    .filter((txn) => Number.isFinite(txn.timestamp));
  if (datedTxns.length === 0) return [];
  const currentYear = new Date().getUTCFullYear();
  const earliestYear = new Date(
    Math.min(...datedTxns.map((txn) => txn.timestamp)),
  ).getUTCFullYear();
  const years = Array.from({ length: currentYear - earliestYear + 1 }, (_, i) => earliestYear + i);
  return years.map((year) => {
    const cutoff = year === currentYear ? Date.now() : yearEndUtc(year);
    const total = pensions.reduce((sum, pot) => {
      const netAfterCutoff = datedTxns
        .filter((txn) => txn.potId === pot.id && txn.timestamp > cutoff)
        .reduce((acc, txn) => acc + (txn.type === 'contribution' ? txn.amount : -txn.amount), 0);
      return sum + convertToBase(Math.max(0, pot.balance - netAfterCutoff), pot.currency);
    }, 0);
    return { year: String(year), value: total };
  });
};

type PensionComputations = {
  totalInBase: number;
  totalMonthlyContribInBase: number;
  projected: number | null;
  monthlyDrawdown: number | null;
  yearsToRetirement: number | null;
  pensionGrowthData: { year: string; value: number }[];
  pensionGrowthPct: number | null;
};

function usePensionComputations(
  pensions: PensionPot[],
  pensionTxns: PensionTransaction[],
  convertToBase: (n: number, currency: string) => number,
  yearsToRetirement: number | null,
): PensionComputations {
  const totalInBase = pensions.reduce((s, p) => s + convertToBase(p.balance, p.currency), 0);
  const totalMonthlyContribInBase = pensions.reduce(
    (s, p) => s + convertToBase(p.employeeMonthly + p.employerMonthly, p.currency),
    0,
  );
  const projected = useMemo(() => {
    if (yearsToRetirement == null) return null;
    const monthlyGrowthRate = ANNUAL_GROWTH_RATE / 12;
    const projectionMonths = yearsToRetirement * 12;
    return (
      totalInBase * Math.pow(1 + ANNUAL_GROWTH_RATE, yearsToRetirement) +
      totalMonthlyContribInBase *
        ((Math.pow(1 + monthlyGrowthRate, projectionMonths) - 1) / monthlyGrowthRate)
    );
  }, [yearsToRetirement, totalInBase, totalMonthlyContribInBase]);
  const monthlyDrawdown = projected == null ? null : projected / (DRAWDOWN_YEARS * 12);
  const pensionGrowthData = useMemo(
    () => computePensionGrowthData(pensions, pensionTxns, convertToBase),
    [pensions, pensionTxns, convertToBase],
  );
  const pensionGrowthPct = useMemo(() => {
    if (pensionGrowthData.length < 2) return null;
    const first = pensionGrowthData[0].value,
      last = pensionGrowthData[pensionGrowthData.length - 1].value;
    return first <= 0 ? null : ((last - first) / first) * 100;
  }, [pensionGrowthData]);
  return {
    totalInBase,
    totalMonthlyContribInBase,
    projected,
    monthlyDrawdown,
    yearsToRetirement,
    pensionGrowthData,
    pensionGrowthPct,
  };
}

function usePensionPageState(): PensionPageState {
  const { fmtBase, fmtNative, convertToBase, isForeign, baseCurrency } = useCurrency();
  const { data: pensions = [], isLoading: loadingPots } = usePensionPots();
  const { data: pensionTxns = [], isLoading: loadingTxns } = usePensionTransactions();
  const createPot = useCreatePensionPot(),
    updatePot = useUpdatePensionPot(),
    deletePot = useDeletePensionPot();
  const createTxn = useCreatePensionTransaction(),
    deleteTxn = useDeletePensionTransaction();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PensionPot | undefined>(undefined);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addTxnForPot, setAddTxnForPot] = useState<PensionPot | null>(null);
  const [retirementYearsInput, setRetirementYearsInput] = useState('');
  const parsedRetirementYears = Number.parseInt(retirementYearsInput, 10);
  const yearsToRetirement =
    Number.isFinite(parsedRetirementYears) && parsedRetirementYears > 0
      ? parsedRetirementYears
      : null;
  const computations = usePensionComputations(
    pensions,
    pensionTxns,
    convertToBase,
    yearsToRetirement,
  );

  const handleSave = (pot: PensionPot | Omit<PensionPot, 'id'>): void => {
    if ('id' in pot) updatePot.mutate(pot as PensionPot);
    else createPot.mutate(pot);
  };
  const handleAddPensionTxn = (t: Omit<PensionTransaction, 'id'>): void => {
    createTxn.mutate(t);
  };
  const handleDeletePensionTxn = (id: number): void => {
    deleteTxn.mutate(id);
  };

  return {
    fmtBase,
    fmtNative,
    convertToBase,
    isForeign,
    baseCurrency,
    pensions,
    pensionTxns,
    isLoading: loadingPots || loadingTxns,
    showModal,
    setShowModal,
    editing,
    setEditing,
    expanded,
    setExpanded,
    addTxnForPot,
    setAddTxnForPot,
    retirementYearsInput,
    setRetirementYearsInput,
    ...computations,
    handleSave,
    handleAddPensionTxn,
    handleDeletePensionTxn,
    deletePot,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type HeroBannerProps = {
  pensions: PensionPot[];
  totalInBase: number;
  projected: number | null;
  yearsToRetirement: number | null;
  fmtBase: (n: number) => string;
  baseCurrency: string;
};

function PensionHeroBanner({
  pensions,
  totalInBase,
  projected,
  yearsToRetirement,
  fmtBase,
  baseCurrency,
}: Readonly<HeroBannerProps>) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-[#0a0f1e] via-[#16213e] to-[#1a1448] p-6 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-56 h-56 bg-amber-500/10 rounded-full -translate-y-1/3 translate-x-1/4" />
      <div className="absolute bottom-0 right-32 w-32 h-32 bg-indigo-500/10 rounded-full translate-y-1/2" />
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={18} className="text-amber-400" />
            <p className="text-amber-300 text-sm">Retirement Planning</p>
          </div>
          <h2 className="text-2xl font-bold">Pension Tracker</h2>
          <p className="text-slate-400 text-sm mt-1">
            {pensions.length} pension pots across {new Set(pensions.map((p) => p.currency)).size}{' '}
            currencies
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-4 text-center">
            <p className="text-amber-300 text-[10px] uppercase tracking-widest mb-1">
              Total Balance
            </p>
            <p className="text-2xl font-bold">{fmtBase(totalInBase)}</p>
            <p className="text-slate-400 text-xs mt-0.5">in {baseCurrency}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-4 text-center">
            <p className="text-amber-300 text-[10px] uppercase tracking-widest mb-1">
              {yearsToRetirement == null ? 'Projection' : `In ${yearsToRetirement} Years`}
            </p>
            <p className="text-2xl font-bold">{projected == null ? '—' : fmtBase(projected)}</p>
            <p className="text-slate-400 text-xs mt-0.5">
              {projected == null ? 'Set retirement horizon below' : 'Projected from current data'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

type SummaryStatsProps = {
  totalInBase: number;
  totalMonthlyContribInBase: number;
  monthlyDrawdown: number | null;
  pensionsCount: number;
  fmtBase: (n: number) => string;
};

function PensionSummaryStats({
  totalInBase,
  totalMonthlyContribInBase,
  monthlyDrawdown,
  pensionsCount,
  fmtBase,
}: Readonly<SummaryStatsProps>) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Total Pension Value"
        value={fmtBase(totalInBase)}
        subtitle={`across ${pensionsCount} pots`}
        icon={ShieldCheck}
        color="amber"
      />
      <StatCard
        label="Monthly Contributions"
        value={fmtBase(totalMonthlyContribInBase)}
        subtitle="combined (you + employer)"
        icon={TrendingUp}
        color="indigo"
      />
      <StatCard
        label="Annual Contributions"
        value={fmtBase(totalMonthlyContribInBase * 12)}
        subtitle="in total per year"
        icon={Calendar}
        color="emerald"
      />
      <StatCard
        label="Monthly Drawdown Est."
        value={monthlyDrawdown == null ? '—' : fmtBase(monthlyDrawdown)}
        subtitle={monthlyDrawdown == null ? 'Set retirement horizon' : 'Over 25-year drawdown'}
        icon={Clock}
        color="sky"
      />
    </div>
  );
}

type GrowthChartProps = {
  pensionGrowthData: { year: string; value: number }[];
  pensionGrowthPct: number | null;
  fmtBase: (n: number) => string;
  baseCurrency: string;
};

function PensionGrowthAreaChart({
  data,
  fmtBase,
}: Readonly<{ data: { year: string; value: number }[]; fmtBase: (n: number) => string }>) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="pensionGrowthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
        />
        <Tooltip
          formatter={(value) => [fmtBase(Number(value) || 0), 'Pension Value']}
          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#f59e0b"
          strokeWidth={4}
          fill="url(#pensionGrowthGrad)"
          dot={false}
          activeDot={{ r: 5, fill: '#f59e0b' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PensionGrowthChart({
  pensionGrowthData,
  pensionGrowthPct,
  fmtBase,
  baseCurrency,
}: Readonly<GrowthChartProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-slate-900">Total Pension Growth</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Combined value across all pots ({baseCurrency})
          </p>
        </div>
        {pensionGrowthPct !== null && (
          <span
            className={`text-sm px-4 py-2 rounded-full font-semibold ${pensionGrowthPct >= 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'}`}
          >
            {pensionGrowthPct >= 0 ? '+' : ''}
            {pensionGrowthPct.toFixed(0)}% since {pensionGrowthData[0]?.year}
          </span>
        )}
      </div>
      {pensionGrowthData.length > 0 ? (
        <PensionGrowthAreaChart data={pensionGrowthData} fmtBase={fmtBase} />
      ) : (
        <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
          Add pension transactions to generate growth history.
        </div>
      )}
    </div>
  );
}

type PensionPotCardProps = {
  pot: PensionPot;
  isOpen: boolean;
  pensionTxns: PensionTransaction[];
  fmtBase: (n: number) => string;
  fmtNative: (n: number, currency: string) => string;
  convertToBase: (n: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
  baseCurrency: string;
  onEdit: (pot: PensionPot) => void;
  onToggle: (id: number | null) => void;
  onDelete: (id: number) => void;
  onAddTxn: (pot: PensionPot) => void;
  onDeleteTxn: (id: number) => void;
};

type PensionPotExpandedProps = {
  pot: PensionPot;
  pensionTxns: PensionTransaction[];
  foreign: boolean;
  balanceInBase: number;
  baseCurrency: string;
  fmtBase: (n: number) => string;
  fmtNative: (n: number, currency: string) => string;
  onDelete: (id: number) => void;
  onAddTxn: (pot: PensionPot) => void;
  onDeleteTxn: (id: number) => void;
};

type PensionPotDetailsProps = {
  pot: PensionPot;
  foreign: boolean;
  balanceInBase: number;
  baseCurrency: string;
  fmtBase: (n: number) => string;
  fmtNative: (n: number, currency: string) => string;
  onDelete: (id: number) => void;
};

function PensionPotDetails({
  pot,
  foreign,
  balanceInBase,
  baseCurrency,
  fmtBase,
  fmtNative,
  onDelete,
}: Readonly<PensionPotDetailsProps>) {
  const detailStats = [
    { label: 'Balance (Native)', value: fmtNative(pot.balance, pot.currency) },
    { label: `Balance (${baseCurrency})`, value: fmtBase(balanceInBase) },
    { label: 'Your Contribution', value: `${fmtNative(pot.employeeMonthly, pot.currency)}/mo` },
    {
      label: 'Employer Match',
      value: pot.employerMonthly > 0 ? `${fmtNative(pot.employerMonthly, pot.currency)}/mo` : 'N/A',
    },
  ];
  return (
    <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/30">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {detailStats.map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl p-3 border border-slate-100">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className="text-sm font-semibold text-slate-800">{value}</p>
          </div>
        ))}
      </div>
      {foreign && (
        <div className="mb-3 p-2.5 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2 text-xs text-amber-700">
          <Info size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            This pot is held in <strong>{pot.currency}</strong>. The {baseCurrency} equivalent uses
            approximate exchange rates.
          </span>
        </div>
      )}
      {pot.notes && (
        <p className="text-xs text-slate-500 flex items-start gap-1.5">
          <Info size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
          {pot.notes}
        </p>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onDelete(pot.id)}
          className="flex items-center gap-1.5 text-xs border border-rose-100 rounded-lg px-3 py-1.5 text-rose-500 hover:bg-rose-50 transition-colors"
        >
          <Trash2 size={12} /> Remove Pot
        </button>
      </div>
    </div>
  );
}

function PensionPotExpanded({
  pot,
  pensionTxns,
  foreign,
  balanceInBase,
  baseCurrency,
  fmtBase,
  fmtNative,
  onDelete,
  onAddTxn,
  onDeleteTxn,
}: Readonly<PensionPotExpandedProps>) {
  return (
    <div>
      <PensionPotDetails
        pot={pot}
        foreign={foreign}
        balanceInBase={balanceInBase}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
        fmtNative={fmtNative}
        onDelete={onDelete}
      />
      <PensionTxnHistory
        pot={pot}
        transactions={pensionTxns}
        onAdd={() => onAddTxn(pot)}
        onDelete={onDeleteTxn}
      />
    </div>
  );
}

type PensionPotCardLeftProps = {
  pot: PensionPot;
  totalMonthly: number;
  txnCount: number;
  fmtNative: (n: number, currency: string) => string;
};

function PensionPotCardLeft({
  pot,
  totalMonthly,
  txnCount,
  fmtNative,
}: Readonly<PensionPotCardLeftProps>) {
  return (
    <>
      <span className="text-2xl flex-shrink-0">{pot.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="font-semibold text-slate-800 text-sm">{pot.name}</p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[pot.type]}`}>
            {pot.type}
          </span>
          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
            {pot.currency}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          {pot.provider} · {fmtNative(totalMonthly, pot.currency)}/mo · {txnCount} transactions
        </p>
      </div>
    </>
  );
}

type PensionPotCardRightProps = {
  pot: PensionPot;
  totalMonthly: number;
  balanceInBase: number;
  foreign: boolean;
  isOpen: boolean;
  fmtBase: (n: number) => string;
  fmtNative: (n: number, currency: string) => string;
  onEdit: (pot: PensionPot) => void;
  onToggle: (id: number | null) => void;
};

function PensionPotCardRight({
  pot,
  totalMonthly,
  balanceInBase,
  foreign,
  isOpen,
  fmtBase,
  fmtNative,
  onEdit,
  onToggle,
}: Readonly<PensionPotCardRightProps>) {
  return (
    <>
      <div className="text-right flex-shrink-0 mr-3">
        <p className="font-bold text-slate-900">{fmtNative(pot.balance, pot.currency)}</p>
        {foreign && (
          <p className="text-xs text-amber-600 font-medium">&asymp; {fmtBase(balanceInBase)}</p>
        )}
        <p className="text-xs text-emerald-600">+{fmtNative(totalMonthly * 12, pot.currency)}/yr</p>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={() => onEdit(pot)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Edit pot"
        >
          <Edit3 size={13} />
        </button>
        <button
          onClick={() => onToggle(isOpen ? null : pot.id)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          title={isOpen ? 'Collapse' : 'View transactions'}
        >
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
    </>
  );
}

function PensionPotCard({
  pot,
  isOpen,
  pensionTxns,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  baseCurrency,
  onEdit,
  onToggle,
  onDelete,
  onAddTxn,
  onDeleteTxn,
}: Readonly<PensionPotCardProps>) {
  const totalMonthly = pot.employeeMonthly + pot.employerMonthly;
  const balanceInBase = convertToBase(pot.balance, pot.currency);
  const foreign = isForeign(pot.currency);
  const txnCount = pensionTxns.filter((t) => t.potId === pot.id).length;
  return (
    <div className="overflow-hidden">
      <div className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors">
        <PensionPotCardLeft
          pot={pot}
          totalMonthly={totalMonthly}
          txnCount={txnCount}
          fmtNative={fmtNative}
        />
        <PensionPotCardRight
          pot={pot}
          totalMonthly={totalMonthly}
          balanceInBase={balanceInBase}
          foreign={foreign}
          isOpen={isOpen}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          onEdit={onEdit}
          onToggle={onToggle}
        />
      </div>
      {isOpen && (
        <PensionPotExpanded
          pot={pot}
          pensionTxns={pensionTxns}
          foreign={foreign}
          balanceInBase={balanceInBase}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          onDelete={onDelete}
          onAddTxn={onAddTxn}
          onDeleteTxn={onDeleteTxn}
        />
      )}
    </div>
  );
}

type PotsListProps = {
  pensions: PensionPot[];
  pensionTxns: PensionTransaction[];
  expanded: number | null;
  setExpanded: (v: number | null) => void;
  setEditing: (v: PensionPot | undefined) => void;
  setShowModal: (v: boolean) => void;
  setAddTxnForPot: (v: PensionPot | null) => void;
  deletePot: { mutate: (id: number) => void };
  handleDeletePensionTxn: (id: number) => void;
  fmtBase: (n: number) => string;
  fmtNative: (n: number, currency: string) => string;
  convertToBase: (n: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
  baseCurrency: string;
};

function PensionPotsListItems({
  pensions,
  pensionTxns,
  expanded,
  setExpanded,
  setEditing,
  setAddTxnForPot,
  deletePot,
  handleDeletePensionTxn,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  baseCurrency,
}: Readonly<PotsListProps>) {
  return (
    <div className="divide-y divide-slate-50">
      {pensions.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm p-6">
          No pension pots yet. Click <strong>Add Pot</strong> to start tracking.
        </div>
      )}
      {pensions.map((pot) => (
        <PensionPotCard
          key={pot.id}
          pot={pot}
          isOpen={expanded === pot.id}
          pensionTxns={pensionTxns}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          convertToBase={convertToBase}
          isForeign={isForeign}
          baseCurrency={baseCurrency}
          onEdit={(p) => setEditing(p)}
          onToggle={setExpanded}
          onDelete={(id) => deletePot.mutate(id)}
          onAddTxn={setAddTxnForPot}
          onDeleteTxn={handleDeletePensionTxn}
        />
      ))}
    </div>
  );
}

function PensionPotsList(props: Readonly<PotsListProps>) {
  const { setEditing, setShowModal } = props;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900">Pension Pots</h3>
          <p className="text-xs text-slate-400 mt-0.5">Click a pot to view transactions</p>
        </div>
        <button
          onClick={() => {
            setEditing(undefined);
            setShowModal(true);
          }}
          className="flex items-center gap-2 text-sm bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={15} /> Add Pot
        </button>
      </div>
      <PensionPotsListItems {...props} />
    </div>
  );
}

type RetirementProjectionProps = {
  totalInBase: number;
  projected: number | null;
  monthlyDrawdown: number | null;
  yearsToRetirement: number | null;
  retirementYearsInput: string;
  onRetirementYearsChange: (value: string) => void;
  fmtBase: (n: number) => string;
  baseCurrency: string;
};

function PensionRetirementProjection({
  totalInBase,
  projected,
  monthlyDrawdown,
  yearsToRetirement,
  retirementYearsInput,
  onRetirementYearsChange,
  fmtBase,
  baseCurrency,
}: Readonly<RetirementProjectionProps>) {
  const items = [
    { label: 'Current Total', value: fmtBase(totalInBase), note: `in ${baseCurrency}` },
    {
      label: 'Years to Retirement',
      value: yearsToRetirement == null ? '—' : `${yearsToRetirement} years`,
      note: yearsToRetirement == null ? 'Enter horizon below' : 'User-defined horizon',
    },
    {
      label: 'Projected Value',
      value: projected == null ? '—' : fmtBase(projected),
      note: projected == null ? 'Awaiting horizon' : 'Based on current trend',
    },
    {
      label: 'Est. Monthly Income',
      value: monthlyDrawdown == null ? '—' : fmtBase(monthlyDrawdown),
      note: monthlyDrawdown == null ? 'Awaiting horizon' : 'Over 25-year drawdown',
    },
  ];
  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100">
      <h3 className="font-semibold text-slate-900 mb-4">Retirement Projection</h3>
      <div className="mb-4 max-w-xs">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Years to Retirement
        </label>
        <input
          type="number"
          min="1"
          value={retirementYearsInput}
          onChange={(event) => onRetirementYearsChange(event.target.value)}
          placeholder="e.g. 25"
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map(({ label, value, note }) => (
          <div key={label} className="bg-white/80 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="font-bold text-amber-700">{value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type PensionPageStateAll = ReturnType<typeof usePensionPageState>;

function PensionModals({ s }: Readonly<{ s: PensionPageStateAll }>) {
  const {
    showModal,
    setShowModal,
    editing,
    setEditing,
    addTxnForPot,
    setAddTxnForPot,
    handleSave,
    handleAddPensionTxn,
  } = s;
  return (
    <>
      {(showModal || editing) && (
        <PensionModal
          existing={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(undefined);
          }}
          onSave={handleSave}
        />
      )}
      {addTxnForPot && (
        <AddPensionTxnModal
          pot={addTxnForPot}
          onClose={() => setAddTxnForPot(null)}
          onSave={handleAddPensionTxn}
        />
      )}
    </>
  );
}

function PensionDataSection({ s }: Readonly<{ s: PensionPageStateAll }>) {
  return (
    <>
      <PensionGrowthChart
        pensionGrowthData={s.pensionGrowthData}
        pensionGrowthPct={s.pensionGrowthPct}
        fmtBase={s.fmtBase}
        baseCurrency={s.baseCurrency}
      />
      <PensionPotsList
        pensions={s.pensions}
        pensionTxns={s.pensionTxns}
        expanded={s.expanded}
        setExpanded={s.setExpanded}
        setEditing={s.setEditing}
        setShowModal={s.setShowModal}
        setAddTxnForPot={s.setAddTxnForPot}
        deletePot={s.deletePot}
        handleDeletePensionTxn={s.handleDeletePensionTxn}
        fmtBase={s.fmtBase}
        fmtNative={s.fmtNative}
        convertToBase={s.convertToBase}
        isForeign={s.isForeign}
        baseCurrency={s.baseCurrency}
      />
      <PensionRetirementProjection
        totalInBase={s.totalInBase}
        projected={s.projected}
        monthlyDrawdown={s.monthlyDrawdown}
        yearsToRetirement={s.yearsToRetirement}
        retirementYearsInput={s.retirementYearsInput}
        onRetirementYearsChange={s.setRetirementYearsInput}
        fmtBase={s.fmtBase}
        baseCurrency={s.baseCurrency}
      />
    </>
  );
}

function PensionPageContent({ s }: Readonly<{ s: PensionPageStateAll }>) {
  return (
    <div className="p-6 space-y-6">
      <PensionModals s={s} />
      <PensionHeroBanner
        pensions={s.pensions}
        totalInBase={s.totalInBase}
        projected={s.projected}
        yearsToRetirement={s.yearsToRetirement}
        fmtBase={s.fmtBase}
        baseCurrency={s.baseCurrency}
      />
      <PensionSummaryStats
        totalInBase={s.totalInBase}
        totalMonthlyContribInBase={s.totalMonthlyContribInBase}
        monthlyDrawdown={s.monthlyDrawdown}
        pensionsCount={s.pensions.length}
        fmtBase={s.fmtBase}
      />
      <PensionDataSection s={s} />
    </div>
  );
}

export function Pension(): JSX.Element {
  const state = usePensionPageState();
  if (state.isLoading) return <LoadingSpinner />;
  return <PensionPageContent s={state} />;
}
