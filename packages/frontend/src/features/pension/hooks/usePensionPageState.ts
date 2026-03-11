import { useCallback, useState } from 'react';
import type { PensionPot, PensionStatementDocument, PensionTransaction } from '@quro/shared';
import { DEFAULT_APP_CAPABILITIES, useAppCapabilities } from '@/lib/useAppCapabilities';
import { useAuth } from '@/lib/AuthContext';
import { useCurrency } from '@/lib/CurrencyContext';
import type { PensionPageState } from '../types';
import { useCreatePensionPot } from './useCreatePensionPot';
import { useCreatePensionTransaction } from './useCreatePensionTransaction';
import { useDeletePensionPot } from './useDeletePensionPot';
import { useDeletePensionTransaction } from './useDeletePensionTransaction';
import { usePensionComputations } from './usePensionComputations';
import { usePensionPots } from './usePensionPots';
import { usePensionStatementDocuments } from './usePensionStatementDocuments';
import { usePensionTransactions } from './usePensionTransactions';
import { useUpdatePensionPot } from './useUpdatePensionPot';
import { useUpdatePensionTransaction } from './useUpdatePensionTransaction';

function usePensionUiState() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PensionPot | undefined>(undefined);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addTxnForPot, setAddTxnForPot] = useState<PensionPot | null>(null);
  const [importModal, setImportModal] = useState<{
    pot: PensionPot;
    importId: number | null;
  } | null>(null);
  const [editingTxn, setEditingTxn] = useState<PensionTransaction | null>(null);

  const openImportModal = useCallback((pot: PensionPot, importId: number | null = null): void => {
    setImportModal({ pot, importId });
  }, []);

  const closeImportModal = useCallback((): void => {
    setImportModal(null);
  }, []);

  return {
    showModal,
    setShowModal,
    editing,
    setEditing,
    expanded,
    setExpanded,
    addTxnForPot,
    setAddTxnForPot,
    importModal,
    openImportModal,
    closeImportModal,
    editingTxn,
    setEditingTxn,
  };
}

export function usePensionPageState(): PensionPageState {
  const { fmtBase, fmtNative, convertToBase, isForeign, baseCurrency } = useCurrency();
  const { user } = useAuth();
  const { data: pensions = [], isLoading: loadingPots } = usePensionPots();
  const { data: pensionTxns = [], isLoading: loadingTransactions } = usePensionTransactions();
  const { data: pensionDocuments = [], isLoading: loadingDocuments } =
    usePensionStatementDocuments();
  const capabilitiesQuery = useAppCapabilities();
  const ui = usePensionUiState();
  const createPot = useCreatePensionPot();
  const updatePot = useUpdatePensionPot();
  const deletePot = useDeletePensionPot();
  const createTxn = useCreatePensionTransaction();
  const updateTxn = useUpdatePensionTransaction();
  const deleteTxn = useDeletePensionTransaction();
  const yearsToRetirement =
    user && user.retirementAge > user.age ? user.retirementAge - user.age : null;
  const computations = usePensionComputations(
    pensions,
    pensionTxns,
    convertToBase,
    yearsToRetirement,
  );
  const handleSave = (pot: PensionPot | Omit<PensionPot, 'id'>): void => {
    if ('id' in pot) {
      updatePot.mutate(pot as PensionPot);
      return;
    }

    createPot.mutate(pot);
  };
  const handleAddPensionTxn = async (
    txn: Omit<PensionTransaction, 'id'> & { id?: number },
  ): Promise<PensionTransaction> => {
    if (txn.id) {
      const { id, ...payload } = txn;
      return updateTxn.mutateAsync({ id, ...payload });
    }

    return createTxn.mutateAsync(txn);
  };
  const documentsByTransactionId = pensionDocuments.reduce((map, document) => {
    map.set(document.transactionId, document);
    return map;
  }, new Map<number, PensionStatementDocument>());

  return {
    fmtBase,
    fmtNative,
    convertToBase,
    isForeign,
    baseCurrency,
    pensions,
    pensionTxns,
    documentsByTransactionId,
    pensionImportCapability:
      capabilitiesQuery.data?.pensionStatementImport ??
      DEFAULT_APP_CAPABILITIES.pensionStatementImport,
    isLoading: loadingPots || loadingTransactions || loadingDocuments,
    ...ui,
    ...computations,
    handleSave,
    handleAddPensionTxn,
    handleDeletePensionTxn: (id: number) => {
      deleteTxn.mutate(id);
    },
    deletePot,
  };
}
