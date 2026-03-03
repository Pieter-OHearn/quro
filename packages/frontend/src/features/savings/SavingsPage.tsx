import { useState } from 'react';
import { LoadingSpinner } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import type { SavingsAccount } from '@quro/shared';
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
  showAccountModal: boolean;
  editing: SavingsAccount | undefined;
  addTxnFor: SavingsAccount | null;
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
  onSaveAccount,
  onDeleteAccount,
  onSaveTxn,
  onDeleteTxn,
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
        onSaveAccount={onSaveAccount}
        onDeleteAccount={onDeleteAccount}
        onCloseTxnModal={() => setAddTxnFor(null)}
        onSaveTxn={onSaveTxn}
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
        onEdit={(account) => setEditing(account)}
        onAddAccount={() => {
          setEditing(undefined);
          setShowAccountModal(true);
        }}
        onAddTxn={(account) => setAddTxnFor(account)}
        onDeleteTxn={onDeleteTxn}
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
      onSaveTxn={(transaction) => createTxn.mutate(transaction)}
      onDeleteTxn={(id) => deleteTxn.mutate(id)}
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
