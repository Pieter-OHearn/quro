import type { Holding, Property } from '@quro/shared';
import type { InvestmentActions, InvestmentUIState } from '../types';
import { useCreateHolding } from './useCreateHolding';
import { useCreateHoldingTransaction } from './useCreateHoldingTransaction';
import { useCreateProperty } from './useCreateProperty';
import { useCreatePropertyTransaction } from './useCreatePropertyTransaction';
import { useDeleteHolding } from './useDeleteHolding';
import { useDeleteHoldingTransaction } from './useDeleteHoldingTransaction';
import { useDeleteProperty } from './useDeleteProperty';
import { useDeletePropertyTransaction } from './useDeletePropertyTransaction';
import { useUpdateHolding } from './useUpdateHolding';
import { useUpdateHoldingTransaction } from './useUpdateHoldingTransaction';
import { useUpdateProperty } from './useUpdateProperty';
import { useUpdatePropertyTransaction } from './useUpdatePropertyTransaction';

function mutateTransaction<T extends { id?: number }>(
  transaction: T,
  update: (transaction: T & { id: number }) => void,
  create: (transaction: Omit<T, 'id'>) => void,
): void {
  if (transaction.id) {
    const { id, ...payload } = transaction;
    update({ id, ...payload } as T & { id: number });
    return;
  }

  create(transaction);
}

export function useInvestmentActions(
  holdings: Holding[],
  properties: Property[],
  ui: InvestmentUIState,
): InvestmentActions {
  const createHolding = useCreateHolding();
  const updateHolding = useUpdateHolding();
  const deleteHolding = useDeleteHolding();
  const createHoldingTxn = useCreateHoldingTransaction();
  const updateHoldingTxn = useUpdateHoldingTransaction();
  const deleteHoldingTxn = useDeleteHoldingTransaction();
  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  useDeleteProperty();
  const createPropertyTxn = useCreatePropertyTransaction();
  const updatePropertyTxn = useUpdatePropertyTransaction();
  const deletePropertyTxn = useDeletePropertyTransaction();
  function handleSaveHolding(
    holding: Holding,
    initialBuy?: { shares: number; price: number; date: string },
    lookupSnapshot?: {
      priceCurrency?: string | null;
      eodDate?: string | null;
      priceUpdatedAt?: string | null;
    },
  ) {
    if (holdings.find((entry) => entry.id === holding.id)) {
      updateHolding.mutate(holding);
      return;
    }
    const { id: _id, ...body } = holding;
    createHolding.mutate(
      { ...body, ...lookupSnapshot },
      {
        onSuccess: (created: Holding) => {
          if (!initialBuy) return;
          createHoldingTxn.mutate({
            holdingId: created.id,
            type: 'buy',
            shares: initialBuy.shares,
            price: initialBuy.price,
            date: initialBuy.date,
            note: 'Initial position',
          });
          ui.setExpandedHoldingId(created.id);
        },
      },
    );
  }
  return {
    handleSaveHolding,
    handleDeleteHolding: (id: number) => {
      deleteHolding.mutate(id);
      if (ui.expandedHoldingId === id) ui.setExpandedHoldingId(null);
    },
    handleAddHoldingTxn: (transaction) =>
      mutateTransaction(transaction, updateHoldingTxn.mutate, createHoldingTxn.mutate),
    handleDeleteHoldingTxn: (id: number) => deleteHoldingTxn.mutate(id),
    handleUpdateProperty: (id: number, value: number, rent: number) => {
      const existing = properties.find((property) => property.id === id);
      if (existing) updateProperty.mutate({ ...existing, currentValue: value, monthlyRent: rent });
    },
    handleSaveProperty: (property) => {
      createProperty.mutate(property);
      ui.setShowAddProperty(false);
    },
    handleAddPropertyTxn: (transaction) =>
      mutateTransaction(transaction, updatePropertyTxn.mutate, createPropertyTxn.mutate),
    handleDeletePropertyTxn: (id: number) => deletePropertyTxn.mutate(id),
  };
}
