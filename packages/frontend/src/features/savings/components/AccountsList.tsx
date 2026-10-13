import type { MouseEvent } from 'react';
import { ChevronDown, ChevronUp, Edit3, Plus } from 'lucide-react';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { monthlyInterest } from '@quro/shared';
import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  IconButton,
  RowActions,
  type DataTableColumn,
} from '@/components/ui';
import { dataColorToken } from '@/lib/dataColors';
import { JointBadge } from '@/features/partner';
import { attributedSavingsBalanceInBase } from '../utils/savings-data';
import { TxnHistory } from './TxnHistory';
import type {
  ConvertToBaseFn,
  IsForeignFn,
  SavingsFormatFn,
  SavingsNativeFormatFn,
} from '../types';

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
  baseCurrency: string;
  onToggleExpand: (id: number) => void;
  onEdit: (account: SavingsAccount) => void;
  onAddAccount: () => void;
  onAddTxn: (account: SavingsAccount) => void;
  onEditTxn: (transaction: SavingsTransaction) => void;
  onDeleteTxn: (id: number) => void;
};

type AccountRowProps = Pick<
  AccountsListProps,
  'transactions' | 'totalInBase' | 'convertToBase' | 'isForeign' | 'fmtBase' | 'fmtNative'
> & {
  acc: SavingsAccount;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onAddTxn: () => void;
  onEditTxn: (transaction: SavingsTransaction) => void;
  onDeleteTxn: (id: number) => void;
};

function buildAccountColumns(baseCurrency: string): readonly DataTableColumn[] {
  return [
    { key: 'account', header: 'Account', width: '29%' },
    { key: 'bank', header: 'Bank', priority: 'secondary', width: '17%' },
    { key: 'rate', header: 'Rate (APY)', numeric: true, priority: 'secondary', width: '9%' },
    {
      key: 'interest',
      header: 'Interest / month',
      numeric: true,
      priority: 'secondary',
      width: '12%',
    },
    { key: 'share', header: 'Share', priority: 'tertiary', width: '7%' },
    { key: 'balance', header: 'Balance', numeric: true, width: '13%' },
    { key: 'value', header: `Value (${baseCurrency})`, numeric: true, width: '13%' },
    { key: 'actions', header: '', priority: 'actions', width: 72 },
  ];
}

const COLUMN_COUNT = 8;

function stopRowClick(handler: () => void) {
  return (event: MouseEvent) => {
    event.stopPropagation();
    handler();
  };
}

function AccountNameCell({ acc, foreign }: Readonly<{ acc: SavingsAccount; foreign: boolean }>) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 leading-none" aria-hidden>
        {acc.emoji}
      </span>
      <span className="min-w-0 truncate font-medium text-fg">{acc.name}</span>
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
        {acc.bunqAccountId && <Badge tone="info">Bunq</Badge>}
        <JointBadge isJoint={acc.isJoint} ownerUserId={acc.userId} />
        {foreign && <Badge>{acc.currency}</Badge>}
      </span>
    </div>
  );
}

/** The account's part of your savings as a meter in the account's saved colour. */
function AccountShareMeter({ acc, pct }: Readonly<{ acc: SavingsAccount; pct: number }>) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: dataColorToken(acc.color) }}
      />
    </div>
  );
}

function AccountRowActions({
  isExpanded,
  onEdit,
  onToggleExpand,
}: Readonly<{ isExpanded: boolean; onEdit: () => void; onToggleExpand: () => void }>) {
  const toggleLabel = isExpanded ? 'Hide transactions' : 'Show transactions';
  return (
    <RowActions>
      <IconButton
        onClick={stopRowClick(onEdit)}
        icon={Edit3}
        label="Edit account"
        title="Edit account"
        size="sm"
        variant="subtle"
      />
      <IconButton
        onClick={stopRowClick(onToggleExpand)}
        icon={isExpanded ? ChevronUp : ChevronDown}
        label={toggleLabel}
        title={toggleLabel}
        aria-expanded={isExpanded}
        size="sm"
        variant="subtle"
      />
    </RowActions>
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
  // The total is the person's savings, so each account's part of it uses its attributed share.
  const pct =
    totalInBase > 0 ? (attributedSavingsBalanceInBase(acc, convertToBase) / totalInBase) * 100 : 0;
  const foreign = isForeign(acc.currency);
  const txnCount = transactions.filter((transaction) => transaction.accountId === acc.id).length;
  const accMonthlyInterest = monthlyInterest(acc.balance, acc.interestRate);

  return (
    <>
      <DataTableRow interactive selected={isExpanded} onClick={onToggleExpand}>
        <DataTableCell columnKey="account">
          <AccountNameCell acc={acc} foreign={foreign} />
        </DataTableCell>
        <DataTableCell columnKey="bank" contentClassName="truncate text-fg-muted">
          {acc.bank} · {acc.accountType} · {txnCount} transactions
        </DataTableCell>
        <DataTableCell columnKey="rate">{acc.interestRate}%</DataTableCell>
        <DataTableCell columnKey="interest">
          {fmtNative(accMonthlyInterest, acc.currency, true)}
        </DataTableCell>
        <DataTableCell columnKey="share">
          <AccountShareMeter acc={acc} pct={pct} />
        </DataTableCell>
        <DataTableCell columnKey="balance" className="font-medium text-fg">
          {fmtNative(acc.balance, acc.currency)}
        </DataTableCell>
        <DataTableCell columnKey="value">{fmtBase(balanceInBase)}</DataTableCell>
        <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
          <AccountRowActions
            isExpanded={isExpanded}
            onEdit={onEdit}
            onToggleExpand={onToggleExpand}
          />
        </DataTableCell>
      </DataTableRow>
      {isExpanded && (
        <DataTableRow mobileCard={false} className="md:hover:bg-transparent">
          <DataTableCell
            colSpan={COLUMN_COUNT}
            className="p-0 max-md:block max-md:py-0"
            contentClassName="w-full"
          >
            <TxnHistory
              account={acc}
              transactions={transactions}
              onAdd={onAddTxn}
              onEdit={onEditTxn}
              onDelete={onDeleteTxn}
            />
          </DataTableCell>
        </DataTableRow>
      )}
    </>
  );
}

function AccountsTotalRow({
  totalInBase,
  totalInterest,
  fmtBase,
}: Readonly<{ totalInBase: number; totalInterest: number; fmtBase: SavingsFormatFn }>) {
  return (
    <DataTableRow data-total>
      <DataTableCell columnKey="account">Total (your share)</DataTableCell>
      <DataTableCell columnKey="bank" />
      <DataTableCell columnKey="rate" />
      <DataTableCell columnKey="interest">{fmtBase(totalInterest, undefined, true)}</DataTableCell>
      <DataTableCell columnKey="share" />
      <DataTableCell columnKey="balance" className="max-md:hidden" />
      <DataTableCell columnKey="value">{fmtBase(totalInBase)}</DataTableCell>
      <DataTableCell columnKey="actions" className="max-md:hidden" />
    </DataTableRow>
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
  baseCurrency,
  onToggleExpand,
  onEdit,
  onAddAccount,
  onAddTxn,
  onEditTxn,
  onDeleteTxn,
}: Readonly<AccountsListProps>) {
  return (
    <DataTable
      title="Savings accounts"
      subtitle={`${accounts.length} accounts · click a row to view and record transactions`}
      action={
        <Button
          onClick={onAddAccount}
          variant="primary"
          size="sm"
          leadingIcon={<Plus size={12} />}
          data-testid="savings-add-account-button"
        >
          Add account
        </Button>
      }
      columns={buildAccountColumns(baseCurrency)}
      tableLayout="fixed"
      minWidth={960}
      isEmpty={accounts.length === 0}
      emptyState={
        <>
          No accounts yet. Click <strong>Add account</strong> to get started.
        </>
      }
      footer={
        accounts.length > 0 ? (
          <p className="text-caption text-fg-subtle">
            At current balances and rates you&apos;ll earn approximately{' '}
            <span className="font-numeric text-fg">{fmtBase(totalInterest * 12)}</span> in interest
            over the next 12 months.
          </p>
        ) : undefined
      }
    >
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
      {accounts.length > 0 && (
        <AccountsTotalRow
          totalInBase={totalInBase}
          totalInterest={totalInterest}
          fmtBase={fmtBase}
        />
      )}
    </DataTable>
  );
}
