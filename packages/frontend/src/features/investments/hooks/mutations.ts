import { useDomainMutation } from '@/lib/useDomainMutation';
import { apiPost, api, apiPatch } from '@/lib/api';
import type {
  Holding,
  HoldingTransaction,
  Property,
  PropertyTransaction,
  HoldingPriceSyncResult,
} from '@quro/shared';
import { normalizeHolding, normalizeProperty } from '../utils/normalizers';

type CreateHoldingPayload = Omit<Holding, 'id'> & {
  priceCurrency?: string | null;
  eodDate?: string | null;
};

export function useCreateHolding() {
  return useDomainMutation('holding', async (holding: CreateHoldingPayload) => {
    const payload = await apiPost<Holding>('/api/investments/holdings', holding);
    return normalizeHolding(payload);
  });
}

export function useCreateHoldingTransaction() {
  return useDomainMutation('holding', async (transaction: Omit<HoldingTransaction, 'id'>) => {
    const payload = await apiPost<HoldingTransaction>(
      '/api/investments/holding-transactions',
      transaction,
    );
    return payload;
  });
}

export function useCreateProperty() {
  return useDomainMutation('property', async (property: Omit<Property, 'id'>) => {
    const payload = await apiPost<Property>('/api/investments/properties', property);
    return normalizeProperty(payload);
  });
}

export function useCreatePropertyTransaction() {
  return useDomainMutation('property', async (transaction: Omit<PropertyTransaction, 'id'>) => {
    const payload = await apiPost<PropertyTransaction>(
      '/api/investments/property-transactions',
      transaction,
    );
    return payload;
  });
}

export type DeleteHoldingMode = 'preserveTransactions' | 'deleteTransactions';

type DeleteHoldingInput = {
  id: number;
  mode?: DeleteHoldingMode;
};

export function useDeleteHolding() {
  return useDomainMutation(
    'holding',
    async ({ id, mode = 'preserveTransactions' }: DeleteHoldingInput) => {
      await api.delete(`/api/investments/holdings/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
  );
}

export function useUnarchiveHolding() {
  return useDomainMutation('holding', async (id: number) => {
    await api.post(`/api/investments/holdings/${id}/unarchive`);
  });
}

export function useDeleteHoldingTransaction() {
  return useDomainMutation('holding', async (id: number) => {
    await api.delete(`/api/investments/holding-transactions/${id}`);
  });
}

export type DeletePropertyMode = 'preserveTransactions' | 'deleteTransactions';

type DeletePropertyInput = {
  id: number;
  mode?: DeletePropertyMode;
};

export function useDeleteProperty() {
  return useDomainMutation(
    'property',
    async ({ id, mode = 'preserveTransactions' }: DeletePropertyInput) => {
      await api.delete(`/api/investments/properties/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
  );
}

export function useUnarchiveProperty() {
  return useDomainMutation('property', async (id: number) => {
    await api.post(`/api/investments/properties/${id}/unarchive`);
  });
}

export function useDeletePropertyTransaction() {
  return useDomainMutation('property', async (id: number) => {
    await api.delete(`/api/investments/property-transactions/${id}`);
  });
}

type SyncHoldingPricesInput = {
  holdingIds?: number[];
};

export function useSyncHoldingPrices() {
  return useDomainMutation('holdingPrices', async (input: SyncHoldingPricesInput = {}) => {
    const payload = await apiPost<HoldingPriceSyncResult>(
      '/api/investments/holdings/sync-prices',
      input,
    );
    return payload;
  });
}

export function useUpdateHolding() {
  return useDomainMutation('holding', async ({ id, ...holding }: Holding) => {
    const payload = await apiPatch<Holding>(`/api/investments/holdings/${id}`, holding);
    return normalizeHolding(payload);
  });
}

export function useUpdateHoldingTransaction() {
  return useDomainMutation('holding', async ({ id, ...transaction }: HoldingTransaction) => {
    const payload = await apiPatch<HoldingTransaction>(
      `/api/investments/holding-transactions/${id}`,
      transaction,
    );
    return payload;
  });
}

export function useUpdateProperty() {
  return useDomainMutation('property', async ({ id, ...property }: Property) => {
    const payload = await apiPatch<Property>(`/api/investments/properties/${id}`, property);
    return normalizeProperty(payload);
  });
}

export function useUpdatePropertyTransaction() {
  return useDomainMutation('property', async ({ id, ...transaction }: PropertyTransaction) => {
    const payload = await apiPatch<PropertyTransaction>(
      `/api/investments/property-transactions/${id}`,
      transaction,
    );
    return payload;
  });
}
