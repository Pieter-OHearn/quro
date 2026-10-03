import { Calendar, ChevronDown, ChevronUp, Edit3, Plus } from 'lucide-react';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { Badge, Button, Card, IconButton, PanelHeader } from '@/components/ui';
import { JointBadge } from '@/features/partner';
import { TxnHistory } from './TxnHistory';
import type {
  ConvertToBaseFn,
  IsForeignFn,
  SavingsFormatFn,
  SavingsNativeFormatFn,
} from '../types';
import { monthlyInterest } from '@quro/shared';

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
        <p className="text-sm font-semibold text-fg-emphasis">{acc.name}</p>
        {acc.bunqAccountId && (
          <Badge tone="info" size="sm">
            Bunq
          </Badge>
        )}
        <JointBadge isJoint={acc.isJoint} ownerUserId={acc.userId} />
        <Badge tone="neutral" size="sm">
          {acc.accountType}
        </Badge>
        <Badge tone={foreign ? 'warningSoft' : 'muted'} size="sm">
          {acc.currency}
        </Badge>
      </div>
      <p className="text-xs text-fg-faint">
        {acc.bank} · {accTxns.length} transactions
      </p>
      <div className="mt-2 w-full bg-surface-muted h-1.5 rounded-full overflow-hidden">
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
      <p className="font-bold text-fg">{fmtNative(acc.balance, acc.currency)}</p>
      {foreign && (
        <p className="text-xs text-brand font-medium">{`\u2248 ${fmtBase(balanceInBase)}`}</p>
      )}
      <p className="text-xs text-success">{acc.interestRate}% APY</p>
      <p className="text-xs text-fg-faint">
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
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-surface-sunken/60 transition-colors group">
      <button
        onClick={onToggleExpand}
        className="w-11 h-11 rounded-xl flex items-center justify-center text-xl bg-surface border border-border-subtle shadow-sm flex-shrink-0 hover:shadow-md transition-shadow"
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
  const accMonthlyInterest = monthlyInterest(acc.balance, acc.interestRate);

  return (
    <div>
      <AccountRowHeader
        acc={acc}
        accTxns={accTxns}
        pct={pct}
        foreign={foreign}
        balanceInBase={balanceInBase}
        monthlyInterest={accMonthlyInterest}
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
    <PanelHeader
      title="Savings Accounts"
      subtitle={`${accounts.length} accounts · click a row to view & record transactions`}
      action={
        <Button
          onClick={onAddAccount}
          variant="primary"
          size="md"
          leadingIcon={<Plus size={15} />}
          data-testid="savings-add-account-button"
        >
          Add Account
        </Button>
      }
    />
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
    <div className="mx-6 mb-6 mt-2 p-4 bg-gradient-to-r from-success-soft to-accent-secondary-soft rounded-xl border border-success-soft-strong flex items-center gap-4">
      <Calendar size={20} className="text-success flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-success-strong">Annual Interest Projection</p>
        <p className="text-xs text-success mt-0.5">
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
    <Card padding="none" className="overflow-hidden">
      <AccountsListHeader accounts={accounts} onAddAccount={onAddAccount} />
      {accounts.length === 0 && (
        <p className="text-center py-10 text-fg-faint text-sm">
          No accounts yet. Click <strong>Add Account</strong> to get started.
        </p>
      )}
      <div className="divide-y divide-surface-sunken">
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
    </Card>
  );
}
