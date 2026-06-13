import { ArchivedItemsSection } from '@/components/ui';
import { useArchivedProperties, useDeleteProperty, useUnarchiveProperty } from '../hooks';

export function PropertiesArchivedSection() {
  const archivedQuery = useArchivedProperties();
  const unarchive = useUnarchiveProperty();
  const deleteProperty = useDeleteProperty();
  const archived = (archivedQuery.data ?? []).map((property) => ({
    ...property,
    name: property.address,
  }));

  return (
    <ArchivedItemsSection
      title="Archived properties"
      entityLabel="Property"
      childrenLabel="transaction history"
      items={archived}
      renderMeta={(property) => property.propertyType}
      getBalance={(property) => ({
        value: property.currentValue,
        currency: property.currency,
        label: 'current value',
      })}
      onUnarchive={(property) => unarchive.mutate(property.id)}
      onHardDelete={(property) =>
        deleteProperty.mutate({ id: property.id, mode: 'deleteTransactions' })
      }
    />
  );
}
