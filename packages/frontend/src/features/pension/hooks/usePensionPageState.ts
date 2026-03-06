import { useState } from 'react';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import type { PensionPageState } from '../types';
import { useCreatePensionPot } from './useCreatePensionPot';
import { useCreatePensionTransaction } from './useCreatePensionTransaction';
import { useDeletePensionPot } from './useDeletePensionPot';
import { useDeletePensionTransaction } from './useDeletePensionTransaction';
import { usePensionComputations } from './usePensionComputations';
import { usePensionPots } from './usePensionPots';
import { usePensionTransactions } from './usePensionTransactions';
import { useUpdatePensionPot } from './useUpdatePensionPot';
import { useUpdatePensionTransaction } from './useUpdatePensionTransaction';

export function usePensionPageState(): PensionPageState {
  const { fmtBase, fmtNative, convertToBase, isForeign, baseCurrency } = useCurrency();
  const { data: pensions = [], isLoading: loadingPots } = usePensionPots();
  const { data: pensionTxns = [], isLoading: loadingTransactions } = usePensionTransactions();

  const createPot = useCreatePensionPot();
  const updatePot = useUpdatePensionPot();
  const deletePot = useDeletePensionPot();
  const createTxn = useCreatePensionTransaction();
  const updateTxn = useUpdatePensionTransaction();
  const deleteTxn = useDeletePensionTransaction();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PensionPot | undefined>(undefined);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addTxnForPot, setAddTxnForPot] = useState<PensionPot | null>(null);
  const [editingTxn, setEditingTxn] = useState<PensionTransaction | null>(null);
  const [retirementYearsInput, setRetirementYearsInput] = useState('');

  const parsedRetirementYears = Number.parseInt(retirementYearsInput, 10);
  const yearsToRetirement =
    Number.isFinite(parsedRetirementYears) && parsedRetirementYears > 0
      ? parsedRetirementYears
      : null;

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

  const handleAddPensionTxn = (txn: Omit<PensionTransaction, 'id'> & { id?: number }): void => {
    if (txn.id) {
      const { id, ...payload } = txn;
      updateTxn.mutate({ id, ...payload });
      return;
    }
    createTxn.mutate(txn);
  };

  const handleDeletePensionTxn = (id: number): void => {
    deleteTxn.mutate(id);
  };

  return {
    fmtBase,
    fmtNative,
    convertToBase,
    isForeign,
    baseCurrency,
    pensions,
    pensionTxns,
    isLoading: loadingPots || loadingTransactions,
    showModal,
    setShowModal,
    editing,
    setEditing,
    expanded,
    setExpanded,
    addTxnForPot,
    setAddTxnForPot,
    editingTxn,
    setEditingTxn,
    retirementYearsInput,
    setRetirementYearsInput,
    ...computations,
    handleSave,
    handleAddPensionTxn,
    handleDeletePensionTxn,
    deletePot,
  };
}
