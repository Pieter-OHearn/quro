import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Mortgage as MortgageType, MortgageTransaction, Property } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import { useProperties } from '../../investments/hooks';
import type {
  CreateMortgagePayload,
  MortgageFormPayload,
  MortgagePageState,
  SaveMortgageTxnInput,
  UpdateMortgagePayload,
} from '../types';
import { useCreateMortgage } from './useCreateMortgage';
import { useCreateMortgageTransaction } from './useCreateMortgageTransaction';
import { useDeleteMortgage, type DeleteMortgageMode } from './useDeleteMortgage';
import { useDeleteMortgageTransaction } from './useDeleteMortgageTransaction';
import { useMortgageModals } from './useMortgageModals';
import { useMortgages } from './useMortgages';
import { useMortgageTransactions } from './useMortgageTransactions';
import { useUpdateMortgage } from './useUpdateMortgage';
import { useUpdateMortgageTransaction } from './useUpdateMortgageTransaction';

function buildLinkedPropertyMap(properties: Property[]): Map<number, Property> {
  const map = new Map<number, Property>();
  for (const property of properties) {
    if (property.mortgageId != null) map.set(property.mortgageId, property);
  }
  return map;
}

const EMPTY_PROPERTIES: Property[] = [];

function parseRequestedMortgageId(raw: string | null): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function useMortgagePageState(): MortgagePageState {
  const [searchParams] = useSearchParams();
  const { fmtBase: fmt } = useCurrency();
  const mortgagesQuery = useMortgages();
  const propertiesQuery = useProperties();
  const mortgages = mortgagesQuery.data ?? [];
  const properties = propertiesQuery.data ?? EMPTY_PROPERTIES;
  const requestedMortgageId = parseRequestedMortgageId(searchParams.get('mortgageId'));
  const [activeMortgageId, setActiveMortgageId] = useState<number | null>(requestedMortgageId);

  useEffect(() => {
    if (requestedMortgageId !== null) setActiveMortgageId(requestedMortgageId);
  }, [requestedMortgageId]);

  const mortgage = mortgages.find((entry) => entry.id === activeMortgageId) ?? mortgages[0];
  const transactionsQuery = useMortgageTransactions(mortgage?.id);
  const txns = transactionsQuery.data ?? [];

  const createMortgageMut = useCreateMortgage();
  const updateMortgageMut = useUpdateMortgage();
  const createTxn = useCreateMortgageTransaction();
  const updateTxn = useUpdateMortgageTransaction();
  const deleteTxnMut = useDeleteMortgageTransaction();
  const deleteMortgageMut = useDeleteMortgage();

  const modals = useMortgageModals();
  const linkedPropertyByMortgageId = useMemo(
    () => buildLinkedPropertyMap(properties),
    [properties],
  );

  const editingLinkedPropertyId = modals.editingMortgage
    ? (linkedPropertyByMortgageId.get(modals.editingMortgage.id)?.id ?? null)
    : null;

  const handleAddTxn = (transaction: SaveMortgageTxnInput) => {
    const { id, ...payload } = transaction;
    if (typeof id === 'number') {
      updateTxn.mutate({ id, ...payload } as MortgageTransaction);
      return;
    }
    createTxn.mutate(payload);
  };
  const handleDeleteTxn = (id: number) => deleteTxnMut.mutate(id);
  const handleDeleteMortgage = (id: number, mode: DeleteMortgageMode = 'preserveTransactions') => {
    deleteMortgageMut.mutate({ id, mode });
    modals.setEditingMortgage(null);
    modals.setShowMortgageModal(false);
    setActiveMortgageId(null);
  };

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
    handleDeleteMortgage,
    isLoading: [mortgagesQuery, propertiesQuery, transactionsQuery].some(
      (query) => query.isLoading,
    ),
    queryFailures: getFailedRouteQueries([
      { label: 'mortgages', ...mortgagesQuery },
      { label: 'properties', ...propertiesQuery },
      { label: 'mortgage transactions', ...transactionsQuery },
    ]),
  };
}
