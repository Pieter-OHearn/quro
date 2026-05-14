import { useMemo, useState } from 'react';
import type { Debt, DebtPayment } from '@quro/shared';
import { ArchiveOrDeleteDialog, LoadingState, PageStack } from '@/components/ui';
import { DebtFormModal } from './components/DebtFormModal';
import { DebtPaymentModal } from './components/DebtPaymentModal';
import { DebtsArchivedSection } from './components/DebtsArchivedSection';
import { DebtsPageLayout } from './components/DebtsPageLayout';
import {
  useCreateDebt,
  useCreateDebtPayment,
  useDebtPayments,
  useDebts,
  useDeleteDebt,
  useDeleteDebtPayment,
  useUpdateDebt,
} from './hooks';
import type { CreateDebtPayload, CreateDebtPaymentPayload, DebtFilterValue } from './types';

type DebtCollections = {
  filteredDebts: Debt[];
  paymentsByDebtId: Map<number, DebtPayment[]>;
};

type DebtModalsProps = {
  debtModalOpen: boolean;
  editingDebt: Debt | null;
  paymentDebt: Debt | null;
  onCloseDebtModal: () => void;
  onClosePaymentModal: () => void;
  onSaveDebt: (payload: CreateDebtPayload, debtId?: number) => Promise<void>;
  onCreatePayment: (payload: CreateDebtPaymentPayload) => Promise<void>;
};

function useDebtCollections(
  debts: Debt[],
  payments: DebtPayment[],
  filter: DebtFilterValue,
): DebtCollections {
  const paymentsByDebtId = useMemo(() => {
    const grouped = new Map<number, DebtPayment[]>();
    for (const payment of payments) {
      const bucket = grouped.get(payment.debtId);
      if (bucket) bucket.push(payment);
      else grouped.set(payment.debtId, [payment]);
    }
    return grouped;
  }, [payments]);

  const filteredDebts = useMemo(
    () => (filter === 'all' ? debts : debts.filter((debt) => debt.type === filter)),
    [debts, filter],
  );

  return { filteredDebts, paymentsByDebtId };
}

function DebtModals({
  debtModalOpen,
  editingDebt,
  paymentDebt,
  onCloseDebtModal,
  onClosePaymentModal,
  onSaveDebt,
  onCreatePayment,
}: Readonly<DebtModalsProps>) {
  return (
    <>
      {debtModalOpen ? (
        <DebtFormModal debt={editingDebt} onClose={onCloseDebtModal} onSubmit={onSaveDebt} />
      ) : null}

      {paymentDebt ? (
        <DebtPaymentModal
          debt={paymentDebt}
          onClose={onClosePaymentModal}
          onSubmit={onCreatePayment}
        />
      ) : null}
    </>
  );
}

function useDebtsPageState() {
  const debtsQuery = useDebts();
  const paymentsQuery = useDebtPayments();
  const createDebt = useCreateDebt();
  const updateDebt = useUpdateDebt();
  const deleteDebt = useDeleteDebt();
  const createDebtPayment = useCreateDebtPayment();
  const deleteDebtPayment = useDeleteDebtPayment();

  const [expandedDebtId, setExpandedDebtId] = useState<number | null>(null);
  const [filter, setFilter] = useState<DebtFilterValue>('all');
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [paymentDebt, setPaymentDebt] = useState<Debt | null>(null);
  const [debtPendingDelete, setDebtPendingDelete] = useState<Debt | null>(null);

  return {
    debtsQuery,
    paymentsQuery,
    createDebt,
    updateDebt,
    deleteDebt,
    createDebtPayment,
    deleteDebtPayment,
    expandedDebtId,
    setExpandedDebtId,
    filter,
    setFilter,
    debtModalOpen,
    setDebtModalOpen,
    editingDebt,
    setEditingDebt,
    paymentDebt,
    setPaymentDebt,
    debtPendingDelete,
    setDebtPendingDelete,
  };
}

export function Debts() {
  const state = useDebtsPageState();
  const debts = state.debtsQuery.data ?? [];
  const payments = state.paymentsQuery.data ?? [];
  const { filteredDebts, paymentsByDebtId } = useDebtCollections(debts, payments, state.filter);

  const handleSaveDebt = async (payload: CreateDebtPayload, debtId?: number) => {
    if (debtId != null) await state.updateDebt.mutateAsync({ id: debtId, ...payload });
    else await state.createDebt.mutateAsync(payload);
  };

  const confirmDeleteDebt = (mode: 'preservePayments' | 'deletePayments') => {
    if (!state.debtPendingDelete) return;
    if (state.expandedDebtId === state.debtPendingDelete.id) state.setExpandedDebtId(null);
    state.deleteDebt.mutate({ id: state.debtPendingDelete.id, mode });
    state.setDebtPendingDelete(null);
  };

  if (state.debtsQuery.isLoading || state.paymentsQuery.isLoading) return <LoadingState compact />;

  return (
    <PageStack>
      <DebtsPageLayout
        debts={debts}
        filteredDebts={filteredDebts}
        paymentsByDebtId={paymentsByDebtId}
        filter={state.filter}
        expandedDebtId={state.expandedDebtId}
        onFilterChange={state.setFilter}
        onAddDebt={() => {
          state.setEditingDebt(null);
          state.setDebtModalOpen(true);
        }}
        onToggleDebt={(debtId) =>
          state.setExpandedDebtId((current) => (current === debtId ? null : debtId))
        }
        onEditDebt={(debt) => {
          state.setEditingDebt(debt);
          state.setDebtModalOpen(true);
        }}
        onDeleteDebt={(debtId) => {
          const target = debts.find((entry) => entry.id === debtId);
          if (target) state.setDebtPendingDelete(target);
        }}
        onLogPayment={state.setPaymentDebt}
        onDeletePayment={(id) => state.deleteDebtPayment.mutate(id)}
      />
      <DebtModals
        debtModalOpen={state.debtModalOpen}
        editingDebt={state.editingDebt}
        paymentDebt={state.paymentDebt}
        onCloseDebtModal={() => {
          state.setDebtModalOpen(false);
          state.setEditingDebt(null);
        }}
        onClosePaymentModal={() => state.setPaymentDebt(null)}
        onSaveDebt={handleSaveDebt}
        onCreatePayment={async (payload) => {
          await state.createDebtPayment.mutateAsync(payload);
        }}
      />
      {state.debtPendingDelete ? (
        <ArchiveOrDeleteDialog
          entityLabel="Debt"
          entityName={state.debtPendingDelete.name}
          balance={state.debtPendingDelete.remainingBalance}
          balanceCurrency={state.debtPendingDelete.currency}
          balanceLabel="outstanding balance"
          childrenLabel="payment history"
          onArchive={() => confirmDeleteDebt('preservePayments')}
          onDelete={() => confirmDeleteDebt('deletePayments')}
          onCancel={() => state.setDebtPendingDelete(null)}
        />
      ) : null}
      <DebtsArchivedSection />
    </PageStack>
  );
}
