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

function generateSchedule(balance: number, rate: number, monthlyPayment: number) {
  const schedule = [];
  const monthlyRate = rate / 100 / 12;
  for (let year = 2026; year <= 2047; year += 2) {
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

export function Mortgage() {
  const { fmtBase } = useCurrency();
  const fmt = (n: number) => fmtBase(n);

  const { data: mortgages = [], isLoading: loadingMortgages } = useMortgages();
  const { data: properties = [], isLoading: loadingProperties } = useProperties();
  const [activeMortgageId, setActiveMortgageId] = useState<number | null>(null);
  const mortgage = mortgages.find((entry) => entry.id === activeMortgageId) ?? mortgages[0];
  const { data: txns = [], isLoading: loadingTxns } = useMortgageTransactions(mortgage?.id);

  const createMortgageMut = useCreateMortgage();
  const updateMortgageMut = useUpdateMortgage();
  const createTxn = useCreateMortgageTransaction();
  const deleteTxnMut = useDeleteMortgageTransaction();

  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showMortgageModal, setShowMortgageModal] = useState(false);
  const [editingMortgage, setEditingMortgage] = useState<MortgageType | null>(null);

  const linkedPropertyByMortgageId = useMemo(() => {
    const linkedMap = new Map<number, Property>();
    for (const property of properties) {
      if (property.mortgageId != null) linkedMap.set(property.mortgageId, property);
    }
    return linkedMap;
  }, [properties]);

  const editingLinkedPropertyId = editingMortgage
    ? (linkedPropertyByMortgageId.get(editingMortgage.id)?.id ?? null)
    : null;

  function handleAddTxn(transaction: Omit<MortgageTransaction, 'id'>) {
    createTxn.mutate(transaction);
  }

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

  function handleDeleteTxn(id: number) {
    deleteTxnMut.mutate(id);
  }

  function closeMortgageModal() {
    setShowMortgageModal(false);
    setEditingMortgage(null);
  }

  if (loadingMortgages || loadingProperties || loadingTxns) {
    return <LoadingSpinner className="min-h-[256px]" />;
  }

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

  const ltv = (mortgage.outstandingBalance / mortgage.propertyValue) * 100;
  const equity = mortgage.propertyValue - mortgage.outstandingBalance;
  const paid = mortgage.originalAmount - mortgage.outstandingBalance;
  const paidPct = (paid / mortgage.originalAmount) * 100;
  const monthsRemaining = Math.round(
    -Math.log(
      1 -
        (mortgage.outstandingBalance * (mortgage.interestRate / 100 / 12)) /
          mortgage.monthlyPayment,
    ) / Math.log(1 + mortgage.interestRate / 100 / 12),
  );
  const yearsRemaining = Math.floor(monthsRemaining / 12);

  const amortization = generateSchedule(
    mortgage.outstandingBalance,
    mortgage.interestRate,
    mortgage.monthlyPayment,
  );

  const paymentBreakdown = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(2025, 8 + i, 1);
    const monthlyRate = mortgage.interestRate / 100 / 12;
    const balance = mortgage.outstandingBalance - i * 600;
    const interest = Math.round(balance * monthlyRate);
    const principal = mortgage.monthlyPayment - interest;
    return {
      month: date.toLocaleDateString('en-GB', { month: 'short' }),
      principal,
      interest,
    };
  });

  return (
    <div className="p-6 space-y-6">
      {showTxnModal && (
        <AddMortgageTxnModal
          mortgage={mortgage}
          onClose={() => setShowTxnModal(false)}
          onSave={handleAddTxn}
        />
      )}

      {showMortgageModal && (
        <AddMortgageModal
          existing={editingMortgage ?? undefined}
          properties={properties}
          linkedPropertyId={editingLinkedPropertyId}
          onClose={closeMortgageModal}
          onSave={handleSaveMortgage}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {mortgages.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setActiveMortgageId(entry.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
              mortgage.id === entry.id
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            <Home size={13} />
            <span className="max-w-[180px] truncate">{entry.propertyAddress.split(',')[0]}</span>
          </button>
        ))}
        <button
          onClick={() => {
            setEditingMortgage(null);
            setShowMortgageModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 text-sm font-medium transition-all"
        >
          <Plus size={14} /> Add Mortgage
        </button>
      </div>

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
            onClick={() => {
              setEditingMortgage(mortgage);
              setShowMortgageModal(true);
            }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-xl transition-all flex-shrink-0"
          >
            <Edit3 size={12} /> Edit
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: 'Outstanding Balance',
              value: fmt(mortgage.outstandingBalance),
              sub: `of ${fmt(mortgage.originalAmount)} original`,
            },
            {
              label: 'Monthly Payment',
              value: fmt(mortgage.monthlyPayment),
              sub: 'Capital + Interest',
            },
            {
              label: 'Interest Rate',
              value: `${mortgage.interestRate}%`,
              sub: `${mortgage.rateType} (until ${mortgage.fixedUntil})`,
            },
            {
              label: 'Years Remaining',
              value: `${yearsRemaining} yrs`,
              sub: `~${monthsRemaining} months`,
            },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white/10 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">{label}</p>
              <p className="font-bold text-white">{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      </div>

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
          subtitle={ltv < 70 ? 'Good — below 70%' : 'High LTV'}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
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

        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-1">Payment Breakdown</h3>
          <p className="text-xs text-slate-400 mb-5">Principal vs Interest per month</p>
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
        </div>
      </div>

      <MortgageTxnHistory
        mortgage={mortgage}
        transactions={txns}
        onAdd={() => setShowTxnModal(true)}
        onDelete={handleDeleteTxn}
      />

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
              {fmt(mortgage.outstandingBalance * 0.1)}) per year without penalty. An extra{' '}
              {fmt(200)}/month would save approximately {fmt(12400)} in interest and reduce your
              term by 3 years.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
