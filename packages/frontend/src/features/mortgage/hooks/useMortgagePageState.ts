import { useMemo } from 'react';
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
import {
  useCreateMortgage,
  useCreateMortgageTransaction,
  useDeleteMortgageTransaction,
  useUpdateMortgage,
  useUpdateMortgageTransaction,
  useDeleteMortgage,
  type DeleteMortgageMode,
} from './mutations';

import { useMortgageModals } from './useMortgageModals';
import { useMortgages } from './useMortgages';
import { useMortgageTransactions } from './useMortgageTransactions';

function buildLinkedPropertyMap(properties: Property[]): Map<number, Property> {
  const map = new Map<number, Property>();
  for (const property of properties) {
    if (property.mortgageId != null) map.set(property.mortgageId, property);
  }
  return map;
}

const EMPTY_PROPERTIES: Property[] = [];
const EMPTY_TRANSACTIONS: MortgageTransaction[] = [];

function parseRequestedMortgageId(raw: string | null): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function mortgageSelectionParams(previous: URLSearchParams, id: number | null) {
  const next = new URLSearchParams(previous);
  if (id === null) next.delete('mortgageId');
  else next.set('mortgageId', String(id));
  return next;
}

export function useMortgagePageState(): MortgagePageState {
  const [searchParams, setSearchParams] = useSearchParams();
  const { fmtBase: fmt } = useCurrency();
  const mortgagesQuery = useMortgages();
  const propertiesQuery = useProperties();
  const mortgages = mortgagesQuery.data ?? [];
  const properties = propertiesQuery.data ?? EMPTY_PROPERTIES;
  const requestedMortgageId = parseRequestedMortgageId(searchParams.get('mortgageId'));
  const activeMortgageId = requestedMortgageId;
  const setActiveMortgageId = (id: number | null) =>
    setSearchParams((previous) => mortgageSelectionParams(previous, id));

  const mortgage = mortgages.find((entry) => entry.id === activeMortgageId) ?? mortgages[0];
  const transactionsQuery = useMortgageTransactions(mortgage?.id);
  const txns = transactionsQuery.data ?? EMPTY_TRANSACTIONS;

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
