import { useState } from 'react';
import { RouteQueryErrorState } from '@/components/errors/RouteQueryErrorState';
import { LoadingSpinner } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { AccountsList, SavingsCharts, SavingsModals, SavingsStats } from './components';
import {
  useContribChartData,
  useGrowthChartData,
  useSavingsData,
  useSavingsMetrics,
} from './hooks';
import type { SaveAccountInput, SaveTransactionInput } from './types';

type SavingsPageBodyProps = {
  accounts: SavingsAccount[];
  transactions: ReturnType<typeof useSavingsData>['transactions'];
  totalInBase: number;
  totalInterest: number;
  avgRate: number;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  setEditing: (account: SavingsAccount | undefined) => void;
  setShowAccountModal: (value: boolean) => void;
  setAddTxnFor: (account: SavingsAccount | null) => void;
  setEditingTxn: (transaction: SavingsTransaction | null) => void;
  showAccountModal: boolean;
  editing: SavingsAccount | undefined;
  addTxnFor: SavingsAccount | null;
  editingTxn: SavingsTransaction | null;
  onSaveAccount: (account: SaveAccountInput) => void;
  onDeleteAccount: (id: number) => void;
  onSaveTxn: (transaction: SaveTransactionInput) => void;
  onDeleteTxn: (id: number) => void;
  contribChartData: ReturnType<typeof useContribChartData>;
  growthChartData: ReturnType<typeof useGrowthChartData>;
  fmtBase: ReturnType<typeof useCurrency>['fmtBase'];
  fmtNative: ReturnType<typeof useCurrency>['fmtNative'];
  convertToBase: ReturnType<typeof useCurrency>['convertToBase'];
  isForeign: ReturnType<typeof useCurrency>['isForeign'];
  baseCurrency: string;
};

function SavingsPageBodyContent(props: Readonly<SavingsPageBodyProps>) {
  const handleCloseAccountModal = () => {
    props.setShowAccountModal(false);
    props.setEditing(undefined);
  };
  const handleCloseTxnModal = () => {
    props.setAddTxnFor(null);
    props.setEditingTxn(null);
  };
  const handleToggleExpand = (id: number) =>
    props.setExpandedId(props.expandedId === id ? null : id);
  const handleAddAccount = () => {
    props.setEditing(undefined);
    props.setShowAccountModal(true);
  };
  const handleAddTxn = (account: SavingsAccount) => {
    props.setEditingTxn(null);
    props.setAddTxnFor(account);
  };
  const handleEditTxn = (transaction: SavingsTransaction) => {
    props.setAddTxnFor(null);
    props.setEditingTxn(transaction);
  };

  return (
    <div className="p-6 space-y-6">
      <SavingsModals
        accounts={props.accounts}
        showAccountModal={props.showAccountModal}
        editing={props.editing}
        addTxnFor={props.addTxnFor}
        editingTxn={props.editingTxn}
        onCloseAccountModal={handleCloseAccountModal}
        onSaveAccount={props.onSaveAccount}
        onDeleteAccount={props.onDeleteAccount}
        onCloseTxnModal={handleCloseTxnModal}
        onSaveTxn={props.onSaveTxn}
      />
      <SavingsStats
        totalInBase={props.totalInBase}
        totalInterest={props.totalInterest}
        avgRate={props.avgRate}
        accounts={props.accounts}
        transactions={props.transactions}
        fmtBase={props.fmtBase}
      />
      <SavingsCharts
        growthChartData={props.growthChartData}
        contribChartData={props.contribChartData}
        baseCurrency={props.baseCurrency}
        fmtBase={props.fmtBase}
      />
      <AccountsList
        accounts={props.accounts}
        transactions={props.transactions}
        totalInBase={props.totalInBase}
        totalInterest={props.totalInterest}
        expandedId={props.expandedId}
        convertToBase={props.convertToBase}
        isForeign={props.isForeign}
        fmtBase={props.fmtBase}
        fmtNative={props.fmtNative}
        onToggleExpand={handleToggleExpand}
        onEdit={props.setEditing}
        onAddAccount={handleAddAccount}
        onAddTxn={handleAddTxn}
        onEditTxn={handleEditTxn}
        onDeleteTxn={props.onDeleteTxn}
      />
    </div>
  );
}

function SavingsPageBody(props: Readonly<SavingsPageBodyProps>) {
  return <SavingsPageBodyContent {...props} />;
}

export function Savings() {
  const { fmtBase, fmtNative, convertToBase, isForeign, baseCurrency } = useCurrency();
  const {
    accounts,
    transactions,
    loadingAccounts,
    loadingTxns,
    queryFailures,
    createAccount,
    updateAccount,
    deleteAccount,
    createTxn,
    updateTxn,
    deleteTxn,
  } = useSavingsData();

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editing, setEditing] = useState<SavingsAccount | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addTxnFor, setAddTxnFor] = useState<SavingsAccount | null>(null);
  const [editingTxn, setEditingTxn] = useState<SavingsTransaction | null>(null);

  const onSaveAccount = (account: SaveAccountInput): void => {
    if (account.id) {
      updateAccount.mutate(account as SavingsAccount);
      return;
    }

    createAccount.mutate(account);
  };

  const { totalInBase, totalInterest, avgRate } = useSavingsMetrics(accounts, convertToBase);
  const contribChartData = useContribChartData(transactions, accounts, convertToBase);
  const growthChartData = useGrowthChartData(transactions, accounts, totalInBase, convertToBase);

  if (loadingAccounts || loadingTxns) {
    return <LoadingSpinner />;
  }

  if (queryFailures.length > 0) {
    return <RouteQueryErrorState routeName="Savings" failedQueries={queryFailures} />;
  }

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
      onSaveAccount={onSaveAccount}
      onDeleteAccount={(id) => deleteAccount.mutate(id)}
      onSaveTxn={(transaction) => {
        if (transaction.id) {
          const { id, ...payload } = transaction;
          updateTxn.mutate({ id, ...payload });
          return;
        }
        createTxn.mutate(transaction);
      }}
      onDeleteTxn={(id) => deleteTxn.mutate(id)}
      setEditingTxn={setEditingTxn}
      editingTxn={editingTxn}
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
