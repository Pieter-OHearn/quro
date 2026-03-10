import { Calendar, ChevronDown, ChevronUp, Edit3, Plus } from 'lucide-react';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { Badge, Button, IconButton } from '@/components/ui';
import { TxnHistory } from './TxnHistory';
import type {
  ConvertToBaseFn,
  IsForeignFn,
  SavingsFormatFn,
  SavingsNativeFormatFn,
} from '../types';

type AccountRowProps = {
  acc: SavingsAccount;
  transactions: SavingsTransaction[];
  totalInBase: number;
  isExpanded: boolean;
  convertToBase: ConvertToBaseFn;
  isForeign: IsForeignFn;
  fmtBase: SavingsFormatFn;
  fmtNative: SavingsNativeFormatFn;
  onToggleExpand: () => void;
  onEdit: () => void;
  onAddTxn: () => void;
  onEditTxn: (transaction: SavingsTransaction) => void;
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
  fmtBase: SavingsFormatFn;
  fmtNative: SavingsNativeFormatFn;
  onToggleExpand: () => void;
  onEdit: () => void;
};

type AccountsListProps = {
  accounts: SavingsAccount[];
  transactions: SavingsTransaction[];
  totalInBase: number;
  totalInterest: number;
  expandedId: number | null;
  convertToBase: ConvertToBaseFn;
  isForeign: IsForeignFn;
  fmtBase: SavingsFormatFn;
  fmtNative: SavingsNativeFormatFn;
  onToggleExpand: (id: number) => void;
  onEdit: (account: SavingsAccount) => void;
  onAddAccount: () => void;
  onAddTxn: (account: SavingsAccount) => void;
  onEditTxn: (transaction: SavingsTransaction) => void;
  onDeleteTxn: (id: number) => void;
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
        <Badge tone="neutral" size="sm">
          {acc.accountType}
        </Badge>
        <Badge tone={foreign ? 'warningSoft' : 'muted'} size="sm">
          {acc.currency}
        </Badge>
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
  fmtBase: SavingsFormatFn;
  fmtNative: SavingsNativeFormatFn;
}) {
  return (
    <div className="text-right flex-shrink-0">
      <p className="font-bold text-slate-900">{fmtNative(acc.balance, acc.currency)}</p>
      {foreign && (
        <p className="text-xs text-indigo-600 font-medium">{`\u2248 ${fmtBase(balanceInBase)}`}</p>
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
}: Readonly<AccountRowHeaderProps>) {
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
        <IconButton
          onClick={onEdit}
          icon={Edit3}
          label="Edit account"
          title="Edit account"
          variant="subtle"
        />
        <IconButton
          onClick={onToggleExpand}
          icon={isExpanded ? ChevronUp : ChevronDown}
          label={isExpanded ? 'Hide transactions' : 'Show transactions'}
          title={isExpanded ? 'Hide transactions' : 'Show transactions'}
          variant="subtle"
        />
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
  onEditTxn,
  onDeleteTxn,
}: Readonly<AccountRowProps>) {
  const balanceInBase = convertToBase(acc.balance, acc.currency);
  const pct = totalInBase > 0 ? (balanceInBase / totalInBase) * 100 : 0;
  const foreign = isForeign(acc.currency);
  const accTxns = transactions.filter((transaction) => transaction.accountId === acc.id);
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
          onEdit={onEditTxn}
          onDelete={onDeleteTxn}
        />
      )}
    </div>
  );
}

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
      <Button onClick={onAddAccount} variant="primary" size="md" leadingIcon={<Plus size={15} />}>
        Add Account
      </Button>
    </div>
  );
}

function AnnualProjection({
  totalInterest,
  fmtBase,
}: {
  totalInterest: number;
  fmtBase: SavingsFormatFn;
}) {
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

export function AccountsList({
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
  onEditTxn,
  onDeleteTxn,
}: Readonly<AccountsListProps>) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <AccountsListHeader accounts={accounts} onAddAccount={onAddAccount} />
      {accounts.length === 0 && (
        <p className="text-center py-10 text-slate-400 text-sm">
          No accounts yet. Click <strong>Add Account</strong> to get started.
        </p>
      )}
      <div className="divide-y divide-slate-50">
        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            acc={account}
            transactions={transactions}
            totalInBase={totalInBase}
            isExpanded={expandedId === account.id}
            convertToBase={convertToBase}
            isForeign={isForeign}
            fmtBase={fmtBase}
            fmtNative={fmtNative}
            onToggleExpand={() => onToggleExpand(account.id)}
            onEdit={() => onEdit(account)}
            onAddTxn={() => onAddTxn(account)}
            onEditTxn={onEditTxn}
            onDeleteTxn={onDeleteTxn}
          />
        ))}
      </div>
      {accounts.length > 0 && <AnnualProjection totalInterest={totalInterest} fmtBase={fmtBase} />}
    </div>
  );
}
