import { useMemo, useState } from 'react';
import type { Mortgage as MortgageType, MortgageTransaction, Property } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { useProperties } from '../../investments/hooks';
import type {
  CreateMortgagePayload,
  MortgageFormPayload,
  MortgagePageState,
  UpdateMortgagePayload,
} from '../types';
import { useCreateMortgage } from './useCreateMortgage';
import { useCreateMortgageTransaction } from './useCreateMortgageTransaction';
import { useDeleteMortgageTransaction } from './useDeleteMortgageTransaction';
import { useMortgageModals } from './useMortgageModals';
import { useMortgages } from './useMortgages';
import { useMortgageTransactions } from './useMortgageTransactions';
import { useUpdateMortgage } from './useUpdateMortgage';

function buildLinkedPropertyMap(properties: Property[]): Map<number, Property> {
  const map = new Map<number, Property>();
  for (const property of properties) {
    if (property.mortgageId != null) map.set(property.mortgageId, property);
  }
  return map;
}

export function useMortgagePageState(): MortgagePageState {
  const { fmtBase: fmt } = useCurrency();
  const { data: mortgages = [], isLoading: loadingMortgages } = useMortgages();
  const { data: properties = [], isLoading: loadingProperties } = useProperties();
  const [activeMortgageId, setActiveMortgageId] = useState<number | null>(null);

  const mortgage = mortgages.find((entry) => entry.id === activeMortgageId) ?? mortgages[0];
  const { data: txns = [], isLoading: loadingTxns } = useMortgageTransactions(mortgage?.id);

  const createMortgageMut = useCreateMortgage();
  const updateMortgageMut = useUpdateMortgage();
  const createTxn = useCreateMortgageTransaction();
  const deleteTxnMut = useDeleteMortgageTransaction();

  const modals = useMortgageModals();
  const linkedPropertyByMortgageId = useMemo(
    () => buildLinkedPropertyMap(properties),
    [properties],
  );

  const editingLinkedPropertyId = modals.editingMortgage
    ? (linkedPropertyByMortgageId.get(modals.editingMortgage.id)?.id ?? null)
    : null;

  const handleAddTxn = (transaction: Omit<MortgageTransaction, 'id'>) =>
    createTxn.mutate(transaction);
  const handleDeleteTxn = (id: number) => deleteTxnMut.mutate(id);

  async function handleSaveMortgage(payload: MortgageFormPayload) {
    const { id, ...body } = payload;

    if (typeof id === 'number') {
      const updated = await updateMortgageMut.mutateAsync({ ...body, id } as UpdateMortgagePayload);
      setActiveMortgageId((updated as MortgageType).id);
      return;
    }

    const created = await createMortgageMut.mutateAsync(body as CreateMortgagePayload);
    setActiveMortgageId((created as MortgageType).id);
  }

  return {
    fmt,
    mortgages,
    properties,
    mortgage,
    txns,
    ...modals,
    editingLinkedPropertyId,
    setActiveMortgageId,
    handleAddTxn,
    handleSaveMortgage,
    handleDeleteTxn,
    isLoading: [loadingMortgages, loadingProperties, loadingTxns].some(Boolean),
  };
}
