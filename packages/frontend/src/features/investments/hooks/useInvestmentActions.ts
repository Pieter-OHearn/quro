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
import { useUpdateProperty } from './useUpdateProperty';

export function useInvestmentActions(
  holdings: Holding[],
  properties: Property[],
  ui: InvestmentUIState,
): InvestmentActions {
  const createHolding = useCreateHolding();
  const updateHolding = useUpdateHolding();
  const deleteHolding = useDeleteHolding();
  const createHoldingTxn = useCreateHoldingTransaction();
  const deleteHoldingTxn = useDeleteHoldingTransaction();

  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  useDeleteProperty();
  const createPropertyTxn = useCreatePropertyTransaction();
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
    handleAddHoldingTxn: (transaction) => createHoldingTxn.mutate(transaction),
    handleDeleteHoldingTxn: (id: number) => deleteHoldingTxn.mutate(id),
    handleUpdateProperty: (id: number, value: number, rent: number) => {
      const existing = properties.find((property) => property.id === id);
      if (existing) {
        updateProperty.mutate({ ...existing, currentValue: value, monthlyRent: rent });
      }
    },
    handleSaveProperty: (property) => {
      createProperty.mutate(property);
      ui.setShowAddProperty(false);
    },
    handleAddPropertyTxn: (transaction) => createPropertyTxn.mutate(transaction),
    handleDeletePropertyTxn: (id: number) => deletePropertyTxn.mutate(id),
  };
}
