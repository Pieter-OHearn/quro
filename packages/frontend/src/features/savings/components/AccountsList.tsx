import { displayLabel } from '@/lib/displayLabels';
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
import { stopRowClick } from '@/components/finance/stopRowClick';
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
    { key: 'account', header: 'Account', phoneCard: 'title', width: '29%' },
    {
      key: 'bank',
      header: 'Bank',
      priority: 'secondary',
      phoneCard: 'hiddenUntilDetails',
      width: '17%',
    },
    {
      key: 'rate',
      header: 'Rate (APY)',
      numeric: true,
      priority: 'secondary',
      phoneCard: 'metric',
      width: '9%',
    },
    {
      key: 'interest',
      header: 'Interest / month',
      numeric: true,
      priority: 'secondary',
      phoneCard: 'metric',
      width: '12%',
    },
    {
      key: 'share',
      header: 'Share',
      priority: 'tertiary',
      phoneCard: 'hiddenUntilDetails',
      width: '7%',
    },
    { key: 'balance', header: 'Balance', numeric: true, phoneCard: 'headline', width: '13%' },
    {
      key: 'value',
      header: `Value (${baseCurrency})`,
      numeric: true,
      phoneCard: 'hiddenUntilDetails',
      width: '13%',
    },
    { key: 'actions', header: '', priority: 'actions', width: 72 },
  ];
}

const COLUMN_COUNT = 8;

function AccountNameCell({
  acc,
  foreign,
  txnCount,
}: Readonly<{ acc: SavingsAccount; foreign: boolean; txnCount: number }>) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex-nowrap">
        <span className="flex min-w-0 items-center gap-2 max-md:basis-full">
          <span className="shrink-0 leading-none" aria-hidden>
            {acc.emoji}
          </span>
          <span className="min-w-0 font-medium text-fg max-md:break-words md:truncate">
            {acc.name}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          {acc.bunqAccountId && <Badge tone="info">Bunq</Badge>}
          <JointBadge isJoint={acc.isJoint} ownerUserId={acc.userId} />
          {foreign && <Badge>{acc.currency}</Badge>}
        </span>
      </div>
      {/* The bank column is a detail on a phone, so the card names the type and the count here. */}
      <p className="mt-0.5 text-caption font-normal text-fg-subtle md:hidden">
        {displayLabel(acc.accountType)} · {txnCount} transactions
      </p>
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
  // The phone card's details button opens the transactions too, so the chevron is left out there.
  return (
    <RowActions className="max-md:justify-start">
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
        className="max-md:hidden"
      />
    </RowActions>
  );
}

function AccountTransactionsRow({
  acc,
  transactions,
  onAddTxn,
  onEditTxn,
  onDeleteTxn,
}: Readonly<
  Pick<AccountRowProps, 'acc' | 'transactions' | 'onAddTxn' | 'onEditTxn' | 'onDeleteTxn'>
>) {
  return (
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
      <DataTableRow
        interactive
        selected={isExpanded}
        onClick={onToggleExpand}
        detailsOpen={isExpanded}
        onDetailsOpenChange={onToggleExpand}
        detailsLabel={acc.name}
      >
        <DataTableCell columnKey="account">
          <AccountNameCell acc={acc} foreign={foreign} txnCount={txnCount} />
        </DataTableCell>
        <DataTableCell
          columnKey="bank"
          contentClassName="text-fg-muted max-md:break-words md:truncate"
        >
          {acc.bank}
          <span className="max-md:hidden">
            {' '}
            · {displayLabel(acc.accountType)} · {txnCount} transactions
          </span>
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
        <AccountTransactionsRow
          acc={acc}
          transactions={transactions}
          onAddTxn={onAddTxn}
          onEditTxn={onEditTxn}
          onDeleteTxn={onDeleteTxn}
        />
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
    <DataTableRow data-total cardDetails={false}>
      <DataTableCell columnKey="account">Total (your share)</DataTableCell>
      <DataTableCell columnKey="bank" className="max-md:hidden" />
      <DataTableCell columnKey="rate" className="max-md:hidden" />
      <DataTableCell columnKey="interest">{fmtBase(totalInterest, undefined, true)}</DataTableCell>
      <DataTableCell columnKey="share" className="max-md:hidden" />
      <DataTableCell columnKey="balance">
        <span className="md:hidden">{fmtBase(totalInBase)}</span>
      </DataTableCell>
      <DataTableCell columnKey="value" className="max-md:hidden">
        {fmtBase(totalInBase)}
      </DataTableCell>
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
      subtitle={`${accounts.length} accounts · open an account to view and record transactions`}
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
