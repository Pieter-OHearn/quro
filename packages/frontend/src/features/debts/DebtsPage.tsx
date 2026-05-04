import { useMemo, useState } from 'react';
import type { Debt, DebtPayment } from '@quro/shared';
import { LoadingState, PageStack } from '@/components/ui';
import { DebtFormModal } from './components/DebtFormModal';
import { DebtPaymentModal } from './components/DebtPaymentModal';
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

export function Debts() {
  const { data: debts = [], isLoading: loadingDebts } = useDebts();
  const { data: payments = [], isLoading: loadingPayments } = useDebtPayments();
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
  const { filteredDebts, paymentsByDebtId } = useDebtCollections(debts, payments, filter);

  const openAddDebtModal = () => {
    setEditingDebt(null);
    setDebtModalOpen(true);
  };

  const openEditDebtModal = (debt: Debt) => {
    setEditingDebt(debt);
    setDebtModalOpen(true);
  };

  const closeDebtModal = () => {
    setDebtModalOpen(false);
    setEditingDebt(null);
  };

  const handleSaveDebt = async (payload: CreateDebtPayload, debtId?: number) => {
    if (debtId != null) await updateDebt.mutateAsync({ id: debtId, ...payload });
    else await createDebt.mutateAsync(payload);
  };

  const handleDeleteDebt = (debtId: number) => {
    if (expandedDebtId === debtId) setExpandedDebtId(null);
    deleteDebt.mutate(debtId);
  };

  if (loadingDebts || loadingPayments) return <LoadingState compact />;

  return (
    <PageStack>
      <DebtsPageLayout
        debts={debts}
        filteredDebts={filteredDebts}
        paymentsByDebtId={paymentsByDebtId}
        filter={filter}
        expandedDebtId={expandedDebtId}
        onFilterChange={setFilter}
        onAddDebt={openAddDebtModal}
        onToggleDebt={(debtId) =>
          setExpandedDebtId((current) => (current === debtId ? null : debtId))
        }
        onEditDebt={openEditDebtModal}
        onDeleteDebt={handleDeleteDebt}
        onLogPayment={setPaymentDebt}
        onDeletePayment={(id) => deleteDebtPayment.mutate(id)}
      />
      <DebtModals
        debtModalOpen={debtModalOpen}
        editingDebt={editingDebt}
        paymentDebt={paymentDebt}
        onCloseDebtModal={closeDebtModal}
        onClosePaymentModal={() => setPaymentDebt(null)}
        onSaveDebt={handleSaveDebt}
        onCreatePayment={async (payload) => {
          await createDebtPayment.mutateAsync(payload);
        }}
      />
    </PageStack>
  );
}
