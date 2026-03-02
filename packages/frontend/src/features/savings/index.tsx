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
  Legend,
} from 'recharts';
import {
  PiggyBank,
  Plus,
  TrendingUp,
  Percent,
  ArrowUpRight,
  Calendar,
  Edit3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import { LoadingSpinner } from '@/components/ui';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import {
  useSavingsAccounts,
  useSavingsTransactions,
  useCreateSavingsAccount,
  useUpdateSavingsAccount,
  useDeleteSavingsAccount,
  useCreateSavingsTransaction,
  useDeleteSavingsTransaction,
} from './hooks';
import { MONTH_PREFIXES } from './constants';
import { AddTxnModal } from './components/AddTxnModal';
import { AccountModal } from './components/AccountModal';
import { TxnHistory } from './components/TxnHistory';

type FmtBase = (v: number, c?: unknown, d?: boolean) => string;
type FmtNative = (v: number, c: string, d?: boolean) => string;

type StatsProps = {
  totalInBase: number;
  totalInterest: number;
  avgRate: number;
  accounts: SavingsAccount[];
  transactions: SavingsTransaction[];
  fmtBase: FmtBase;
};

function TotalSavingsCard({
  totalInBase,
  accounts,
  transactions,
  fmtBase,
}: Pick<StatsProps, 'totalInBase' | 'accounts' | 'transactions' | 'fmtBase'>) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <PiggyBank size={18} />
        </div>
        <p className="text-sm text-slate-500">Total Savings</p>
      </div>
      <p className="text-2xl font-bold text-slate-900">{fmtBase(totalInBase)}</p>
      <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600">
        <ArrowUpRight size={12} />
        <span>across {accounts.length} accounts</span>
      </div>
      <p className="text-xs text-slate-400 mt-0.5">
        {new Set(accounts.map((a) => a.currency)).size} currencies · {transactions.length}{' '}
        transactions
      </p>
    </div>
  );
}

function SavingsStats({
  totalInBase,
  totalInterest,
  avgRate,
  accounts,
  transactions,
  fmtBase,
}: StatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <TotalSavingsCard
        totalInBase={totalInBase}
        accounts={accounts}
        transactions={transactions}
        fmtBase={fmtBase}
      />
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Percent size={18} />
          </div>
          <p className="text-sm text-slate-500">Avg. Interest Rate</p>
        </div>
        <p className="text-2xl font-bold text-slate-900">{avgRate.toFixed(2)}%</p>
        <p className="text-xs text-slate-400 mt-1">Weighted average APY</p>
      </div>
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <TrendingUp size={18} />
          </div>
          <p className="text-sm text-slate-500">Monthly Interest</p>
        </div>
        <p className="text-2xl font-bold text-slate-900">
          {fmtBase(totalInterest, undefined, true)}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {'\u2248'} {fmtBase(totalInterest * 12)} per year
        </p>
      </div>
    </div>
  );
}

type ChartsProps = {
  growthChartData: { month: string; savings: number }[];
  contribChartData: {
    month: string;
    contribution: number;
    interest: number;
    withdrawals: number;
  }[];
  baseCurrency: string;
  fmtBase: FmtBase;
};

function GrowthChart({
  growthChartData,
  baseCurrency,
  fmtBase,
}: Pick<ChartsProps, 'growthChartData' | 'baseCurrency' | 'fmtBase'>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Savings Growth</h3>
      <p className="text-xs text-slate-400 mb-5">Total balance in {baseCurrency}</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={growthChartData}>
          <defs>
            <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(v: number) => [fmtBase(v), 'Total Savings']}
            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
          />
          <Area
            type="monotone"
            dataKey="savings"
            stroke="#6366f1"
            strokeWidth={2.5}
            fill="url(#savingsGrad)"
            dot={{ r: 3, fill: '#6366f1' }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ContribChart({
  contribChartData,
  baseCurrency,
  fmtBase,
}: Pick<ChartsProps, 'contribChartData' | 'baseCurrency' | 'fmtBase'>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Contributions vs Interest</h3>
      <p className="text-xs text-slate-400 mb-5">Monthly totals in {baseCurrency}</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={contribChartData} barSize={18}>
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
            formatter={(v: number, name: string) => [
              fmtBase(v),
              name === 'contribution' ? 'Net Contributions' : 'Interest',
            ]}
            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px' }}
            formatter={(v) => (v === 'contribution' ? 'Net Contributions' : 'Interest')}
          />
          <Bar dataKey="contribution" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="interest" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SavingsCharts({ growthChartData, contribChartData, baseCurrency, fmtBase }: ChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <GrowthChart
        growthChartData={growthChartData}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
      />
      <ContribChart
        contribChartData={contribChartData}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
      />
    </div>
  );
}

type AccountRowProps = {
  acc: SavingsAccount;
  transactions: SavingsTransaction[];
  totalInBase: number;
  isExpanded: boolean;
  convertToBase: (v: number, c: string) => number;
  isForeign: (c: string) => boolean;
  fmtBase: FmtBase;
  fmtNative: FmtNative;
  onToggleExpand: () => void;
  onEdit: () => void;
  onAddTxn: () => void;
  onDeleteTxn: (id: number) => void;
};

type AccountRowHeaderProps = {
  acc: SavingsAccount;
  accTxns: SavingsTransaction[];
  pct: number;
  foreign: boolean;
  balanceInBase: number;
  monthlyInterest: number;
  isExpanded: boolean;
  fmtBase: FmtBase;
  fmtNative: FmtNative;
  onToggleExpand: () => void;
  onEdit: () => void;
};

function AccountRowMeta({
  acc,
  accTxns,
  pct,
  foreign,
}: {
  acc: SavingsAccount;
  accTxns: SavingsTransaction[];
  pct: number;
  foreign: boolean;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
        <p className="text-sm font-semibold text-slate-800">{acc.name}</p>
        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
          {acc.accountType}
        </span>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full ${foreign ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
        >
          {acc.currency}
        </span>
      </div>
      <p className="text-xs text-slate-400">
        {acc.bank} · {accTxns.length} transactions
      </p>
      <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: acc.color }}
        />
      </div>
    </div>
  );
}

function AccountRowBalance({
  acc,
  foreign,
  balanceInBase,
  monthlyInterest,
  fmtBase,
  fmtNative,
}: {
  acc: SavingsAccount;
  foreign: boolean;
  balanceInBase: number;
  monthlyInterest: number;
  fmtBase: FmtBase;
  fmtNative: FmtNative;
}) {
  return (
    <div className="text-right flex-shrink-0">
      <p className="font-bold text-slate-900">{fmtNative(acc.balance, acc.currency)}</p>
      {foreign && (
        <p className="text-xs text-indigo-600 font-medium">
          {'\u2248'} {fmtBase(balanceInBase)}
        </p>
      )}
      <p className="text-xs text-emerald-600">{acc.interestRate}% APY</p>
      <p className="text-xs text-slate-400">
        {fmtNative(monthlyInterest, acc.currency, true)}/mo interest
      </p>
    </div>
  );
}

function AccountRowHeader({
  acc,
  accTxns,
  pct,
  foreign,
  balanceInBase,
  monthlyInterest,
  isExpanded,
  fmtBase,
  fmtNative,
  onToggleExpand,
  onEdit,
}: AccountRowHeaderProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors group">
      <button
        onClick={onToggleExpand}
        className="w-11 h-11 rounded-xl flex items-center justify-center text-xl bg-white border border-slate-100 shadow-sm flex-shrink-0 hover:shadow-md transition-shadow"
      >
        {acc.emoji}
      </button>
      <AccountRowMeta acc={acc} accTxns={accTxns} pct={pct} foreign={foreign} />
      <AccountRowBalance
        acc={acc}
        foreign={foreign}
        balanceInBase={balanceInBase}
        monthlyInterest={monthlyInterest}
        fmtBase={fmtBase}
        fmtNative={fmtNative}
      />
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Edit account"
        >
          <Edit3 size={14} />
        </button>
        <button
          onClick={onToggleExpand}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          title={isExpanded ? 'Hide transactions' : 'Show transactions'}
        >
          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>
    </div>
  );
}

function AccountRow({
  acc,
  transactions,
  totalInBase,
  isExpanded,
  convertToBase,
  isForeign,
  fmtBase,
  fmtNative,
  onToggleExpand,
  onEdit,
  onAddTxn,
  onDeleteTxn,
}: AccountRowProps) {
  const balanceInBase = convertToBase(acc.balance, acc.currency);
  const pct = totalInBase > 0 ? (balanceInBase / totalInBase) * 100 : 0;
  const foreign = isForeign(acc.currency);
  const accTxns = transactions.filter((t) => t.accountId === acc.id);
  const monthlyInterest = (acc.balance * acc.interestRate) / 100 / 12;

  return (
    <div>
      <AccountRowHeader
        acc={acc}
        accTxns={accTxns}
        pct={pct}
        foreign={foreign}
        balanceInBase={balanceInBase}
        monthlyInterest={monthlyInterest}
        isExpanded={isExpanded}
        fmtBase={fmtBase}
        fmtNative={fmtNative}
        onToggleExpand={onToggleExpand}
        onEdit={onEdit}
      />
      {isExpanded && (
        <TxnHistory
          account={acc}
          transactions={transactions}
          onAdd={onAddTxn}
          onDelete={onDeleteTxn}
        />
      )}
    </div>
  );
}

type AccountsListProps = {
  accounts: SavingsAccount[];
  transactions: SavingsTransaction[];
  totalInBase: number;
  totalInterest: number;
  expandedId: number | null;
  convertToBase: (v: number, c: string) => number;
  isForeign: (c: string) => boolean;
  fmtBase: FmtBase;
  fmtNative: FmtNative;
  onToggleExpand: (id: number) => void;
  onEdit: (acc: SavingsAccount) => void;
  onAddAccount: () => void;
  onAddTxn: (acc: SavingsAccount) => void;
  onDeleteTxn: (id: number) => void;
};

function AccountsListHeader({
  accounts,
  onAddAccount,
}: {
  accounts: SavingsAccount[];
  onAddAccount: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
      <div>
        <h3 className="font-semibold text-slate-900">Savings Accounts</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {accounts.length} accounts · click a row to view & record transactions
        </p>
      </div>
      <button
        onClick={onAddAccount}
        className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
      >
        <Plus size={15} /> Add Account
      </button>
    </div>
  );
}

function AnnualProjection({ totalInterest, fmtBase }: { totalInterest: number; fmtBase: FmtBase }) {
  return (
    <div className="mx-6 mb-6 mt-2 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 flex items-center gap-4">
      <Calendar size={20} className="text-emerald-600 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-emerald-800">Annual Interest Projection</p>
        <p className="text-xs text-emerald-600 mt-0.5">
          At current balances and rates you'll earn approximately{' '}
          <strong>{fmtBase(totalInterest * 12)}</strong> in interest over the next 12 months.
        </p>
      </div>
    </div>
  );
}

function AccountsList({
  accounts,
  transactions,
  totalInBase,
  totalInterest,
  expandedId,
  convertToBase,
  isForeign,
  fmtBase,
  fmtNative,
  onToggleExpand,
  onEdit,
  onAddAccount,
  onAddTxn,
  onDeleteTxn,
}: AccountsListProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <AccountsListHeader accounts={accounts} onAddAccount={onAddAccount} />
      {accounts.length === 0 && (
        <p className="text-center py-10 text-slate-400 text-sm">
          No accounts yet. Click <strong>Add Account</strong> to get started.
        </p>
      )}
      <div className="divide-y divide-slate-50">
        {accounts.map((acc) => (
          <AccountRow
            key={acc.id}
            acc={acc}
            transactions={transactions}
            totalInBase={totalInBase}
            isExpanded={expandedId === acc.id}
            convertToBase={convertToBase}
            isForeign={isForeign}
            fmtBase={fmtBase}
            fmtNative={fmtNative}
            onToggleExpand={() => onToggleExpand(acc.id)}
            onEdit={() => onEdit(acc)}
            onAddTxn={() => onAddTxn(acc)}
            onDeleteTxn={onDeleteTxn}
          />
        ))}
      </div>
      {accounts.length > 0 && <AnnualProjection totalInterest={totalInterest} fmtBase={fmtBase} />}
    </div>
  );
}

function useContribChartData(
  transactions: SavingsTransaction[],
  accounts: SavingsAccount[],
  convertToBase: (v: number, c: string) => number,
) {
  return useMemo(() => {
    function getBase(t: SavingsTransaction): number {
      const acc = accounts.find((a) => a.id === t.accountId);
      return convertToBase(t.amount, acc?.currency ?? 'EUR');
    }
    return MONTH_PREFIXES.map(({ label, prefix }) => {
      const monthTxns = transactions.filter((t) => t.date.startsWith(prefix));
      const deposits = monthTxns
        .filter((t) => t.type === 'deposit')
        .reduce((s, t) => s + getBase(t), 0);
      const withdrawals = monthTxns
        .filter((t) => t.type === 'withdrawal')
        .reduce((s, t) => s + getBase(t), 0);
      const interest = monthTxns
        .filter((t) => t.type === 'interest')
        .reduce((s, t) => s + getBase(t), 0);
      return {
        month: label,
        contribution: Math.round(deposits - withdrawals),
        interest: Math.round(interest),
        withdrawals: Math.round(withdrawals),
      };
    });
  }, [transactions, accounts, convertToBase]);
}

function useGrowthChartData(
  transactions: SavingsTransaction[],
  accounts: SavingsAccount[],
  totalInBase: number,
  convertToBase: (v: number, c: string) => number,
) {
  return useMemo(() => {
    return MONTH_PREFIXES.map(({ label, prefix }) => {
      const cutoff = `${prefix}-31`;
      const futureTxns = transactions.filter((t) => t.date > cutoff);
      const futureEffect = futureTxns.reduce((s, t) => {
        const acc = accounts.find((a) => a.id === t.accountId);
        const inBase = convertToBase(t.amount, acc?.currency ?? 'EUR');
        return t.type === 'withdrawal' ? s - inBase : s + inBase;
      }, 0);
      return { month: label, savings: Math.max(0, Math.round(totalInBase - futureEffect)) };
    });
  }, [transactions, accounts, totalInBase, convertToBase]);
}

function useSavingsData() {
  const { data: accounts = [], isLoading: loadingAccounts } = useSavingsAccounts();
  const { data: transactions = [], isLoading: loadingTxns } = useSavingsTransactions();
  const createAccount = useCreateSavingsAccount();
  const updateAccount = useUpdateSavingsAccount();
  const deleteAccount = useDeleteSavingsAccount();
  const createTxn = useCreateSavingsTransaction();
  const deleteTxn = useDeleteSavingsTransaction();
  return {
    accounts,
    transactions,
    loadingAccounts,
    loadingTxns,
    createAccount,
    updateAccount,
    deleteAccount,
    createTxn,
    deleteTxn,
  };
}

function useSavingsMetrics(
  accounts: SavingsAccount[],
  convertToBase: (v: number, c: string) => number,
) {
  const totalInBase = useMemo(
    () => accounts.reduce((s, a) => s + convertToBase(a.balance, a.currency), 0),
    [accounts, convertToBase],
  );
  const totalInterest = useMemo(
    () =>
      accounts.reduce(
        (s, a) => s + convertToBase((a.balance * a.interestRate) / 100 / 12, a.currency),
        0,
      ),
    [accounts, convertToBase],
  );
  const avgRate = useMemo(
    () =>
      accounts.length && totalInBase > 0
        ? accounts.reduce(
            (s, a) => s + a.interestRate * (convertToBase(a.balance, a.currency) / totalInBase),
            0,
          )
        : 0,
    [accounts, totalInBase, convertToBase],
  );
  return { totalInBase, totalInterest, avgRate };
}

type SavingsModalsProps = {
  showAccountModal: boolean;
  editing: SavingsAccount | undefined;
  addTxnFor: SavingsAccount | null;
  onCloseAccountModal: () => void;
  onSaveAccount: (a: Omit<SavingsAccount, 'id'> & { id?: number }) => void;
  onDeleteAccount: (id: number) => void;
  onCloseTxnModal: () => void;
  onSaveTxn: (t: Omit<SavingsTransaction, 'id'>) => void;
};

function SavingsModals({
  showAccountModal,
  editing,
  addTxnFor,
  onCloseAccountModal,
  onSaveAccount,
  onDeleteAccount,
  onCloseTxnModal,
  onSaveTxn,
}: Readonly<SavingsModalsProps>) {
  return (
    <>
      {(showAccountModal || editing) && (
        <AccountModal
          existing={editing}
          onClose={onCloseAccountModal}
          onSave={onSaveAccount}
          onDelete={onDeleteAccount}
        />
      )}
      {addTxnFor && (
        <AddTxnModal account={addTxnFor} onClose={onCloseTxnModal} onSave={onSaveTxn} />
      )}
    </>
  );
}

type SavingsPageBodyProps = {
  accounts: SavingsAccount[];
  transactions: SavingsTransaction[];
  totalInBase: number;
  totalInterest: number;
  avgRate: number;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  setEditing: (a: SavingsAccount | undefined) => void;
  setShowAccountModal: (v: boolean) => void;
  setAddTxnFor: (a: SavingsAccount | null) => void;
  showAccountModal: boolean;
  editing: SavingsAccount | undefined;
  addTxnFor: SavingsAccount | null;
  handleSaveAccount: (a: Omit<SavingsAccount, 'id'> & { id?: number }) => void;
  deleteAccount: { mutate: (id: number) => void };
  createTxn: { mutate: (t: Omit<SavingsTransaction, 'id'>) => void };
  deleteTxn: { mutate: (id: number) => void };
  contribChartData: ChartsProps['contribChartData'];
  growthChartData: ChartsProps['growthChartData'];
  fmtBase: FmtBase;
  fmtNative: FmtNative;
  convertToBase: AccountsListProps['convertToBase'];
  isForeign: AccountsListProps['isForeign'];
  baseCurrency: string;
};

function SavingsPageBody({
  accounts,
  transactions,
  totalInBase,
  totalInterest,
  avgRate,
  expandedId,
  setExpandedId,
  setEditing,
  setShowAccountModal,
  setAddTxnFor,
  showAccountModal,
  editing,
  addTxnFor,
  handleSaveAccount,
  deleteAccount,
  createTxn,
  deleteTxn,
  contribChartData,
  growthChartData,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  baseCurrency,
}: Readonly<SavingsPageBodyProps>) {
  return (
    <div className="p-6 space-y-6">
      <SavingsModals
        showAccountModal={showAccountModal}
        editing={editing}
        addTxnFor={addTxnFor}
        onCloseAccountModal={() => {
          setShowAccountModal(false);
          setEditing(undefined);
        }}
        onSaveAccount={handleSaveAccount}
        onDeleteAccount={(id) => deleteAccount.mutate(id)}
        onCloseTxnModal={() => setAddTxnFor(null)}
        onSaveTxn={(t) => createTxn.mutate(t)}
      />
      <SavingsStats
        totalInBase={totalInBase}
        totalInterest={totalInterest}
        avgRate={avgRate}
        accounts={accounts}
        transactions={transactions}
        fmtBase={fmtBase}
      />
      <SavingsCharts
        growthChartData={growthChartData}
        contribChartData={contribChartData}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
      />
      <AccountsList
        accounts={accounts}
        transactions={transactions}
        totalInBase={totalInBase}
        totalInterest={totalInterest}
        expandedId={expandedId}
        convertToBase={convertToBase}
        isForeign={isForeign}
        fmtBase={fmtBase}
        fmtNative={fmtNative}
        onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
        onEdit={(acc) => setEditing(acc)}
        onAddAccount={() => {
          setEditing(undefined);
          setShowAccountModal(true);
        }}
        onAddTxn={(acc) => setAddTxnFor(acc)}
        onDeleteTxn={(id) => deleteTxn.mutate(id)}
      />
    </div>
  );
}

export function Savings() {
  const { fmtBase, fmtNative, convertToBase, isForeign, baseCurrency } = useCurrency();
  const {
    accounts,
    transactions,
    loadingAccounts,
    loadingTxns,
    createAccount,
    updateAccount,
    deleteAccount,
    createTxn,
    deleteTxn,
  } = useSavingsData();
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editing, setEditing] = useState<SavingsAccount | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addTxnFor, setAddTxnFor] = useState<SavingsAccount | null>(null);
  const handleSaveAccount = (a: Omit<SavingsAccount, 'id'> & { id?: number }): void => {
    if (a.id) updateAccount.mutate(a as SavingsAccount);
    else createAccount.mutate(a);
  };
  const { totalInBase, totalInterest, avgRate } = useSavingsMetrics(accounts, convertToBase);
  const contribChartData = useContribChartData(transactions, accounts, convertToBase);
  const growthChartData = useGrowthChartData(transactions, accounts, totalInBase, convertToBase);
  if (loadingAccounts || loadingTxns) return <LoadingSpinner />;
  return (
    <SavingsPageBody
      accounts={accounts}
      transactions={transactions}
      totalInBase={totalInBase}
      totalInterest={totalInterest}
      avgRate={avgRate}
      expandedId={expandedId}
      setExpandedId={setExpandedId}
      setEditing={setEditing}
      setShowAccountModal={setShowAccountModal}
      setAddTxnFor={setAddTxnFor}
      showAccountModal={showAccountModal}
      editing={editing}
      addTxnFor={addTxnFor}
      handleSaveAccount={handleSaveAccount}
      deleteAccount={deleteAccount}
      createTxn={createTxn}
      deleteTxn={deleteTxn}
      contribChartData={contribChartData}
      growthChartData={growthChartData}
      fmtBase={fmtBase}
      fmtNative={fmtNative}
      convertToBase={convertToBase}
      isForeign={isForeign}
      baseCurrency={baseCurrency}
    />
  );
}
