import { AddHoldingTxnModal } from './AddHoldingTxnModal';
import { AddPropertyModal } from './AddPropertyModal';
import { AddPropertyTxnModal } from './AddPropertyTxnModal';
import { EditHoldingModal } from './EditHoldingModal';
import { UpdatePropertyModal } from './UpdatePropertyModal';
import type { HoldingModalsProps, PropertyModalsProps } from '../types';
import { computePosition, getPropertyMortgageBalance } from '../utils/position';
import { EMPTY_POSITION } from '../utils/portfolio';

type InvestmentModalsProps = {
  holdingModals: HoldingModalsProps;
  propertyModals: PropertyModalsProps;
};

function resolveHoldingTxnModalState(
  addTxnForHolding: HoldingModalsProps['addTxnForHolding'],
  editingHoldingTxn: HoldingModalsProps['editingHoldingTxn'],
  holdings: HoldingModalsProps['holdings'],
  holdingTxns: HoldingModalsProps['holdingTxns'],
  positions: HoldingModalsProps['positions'],
) {
  const editingTransactionHolding =
    editingHoldingTxn != null
      ? (holdings.find((holding) => holding.id === editingHoldingTxn.holdingId) ?? null)
      : null;
  const modalHolding = addTxnForHolding ?? editingTransactionHolding;
  if (!modalHolding) return { modalHolding: null, effectivePosition: EMPTY_POSITION };

  const effectivePosition = editingHoldingTxn
    ? computePosition(
        modalHolding.id,
        holdingTxns.filter((txn) => txn.id !== editingHoldingTxn.id),
      )
    : (positions[modalHolding.id] ?? EMPTY_POSITION);

  return { modalHolding, effectivePosition };
}

function HoldingModals({
  showAddHolding,
  editingHolding,
  addTxnForHolding,
  editingHoldingTxn,
  holdings,
  holdingTxns,
  positions,
  onCloseEditHolding,
  onSaveHolding,
  onDeleteHolding,
  onCloseAddHoldingTxn,
  onSaveHoldingTxn,
}: HoldingModalsProps) {
  const { modalHolding, effectivePosition } = resolveHoldingTxnModalState(
    addTxnForHolding,
    editingHoldingTxn,
    holdings,
    holdingTxns,
    positions,
  );

  return (
    <>
      {(showAddHolding || editingHolding) && (
        <EditHoldingModal
          existing={editingHolding ?? undefined}
          onClose={onCloseEditHolding}
          onSave={onSaveHolding}
          onDelete={onDeleteHolding}
        />
      )}
      {modalHolding && (
        <AddHoldingTxnModal
          holding={modalHolding}
          existing={editingHoldingTxn ?? undefined}
          currentPosition={effectivePosition}
          onClose={onCloseAddHoldingTxn}
          onSave={onSaveHoldingTxn}
        />
      )}
    </>
  );
}

function PropertyModals({
  updatingProperty,
  showAddProperty,
  addTxnForProperty,
  editingPropertyTxn,
  properties,
  mortgageById,
  onCloseUpdateProperty,
  onSaveUpdateProperty,
  onCloseAddProperty,
  onSaveAddProperty,
  onCloseAddPropertyTxn,
  onSavePropertyTxn,
}: PropertyModalsProps) {
  const editingTransactionProperty =
    editingPropertyTxn != null
      ? (properties.find((property) => property.id === editingPropertyTxn.propertyId) ?? null)
      : null;
  const modalProperty = addTxnForProperty ?? editingTransactionProperty;

  return (
    <>
      {updatingProperty && (
        <UpdatePropertyModal
          property={updatingProperty}
          mortgageBalance={getPropertyMortgageBalance(updatingProperty, mortgageById)}
          onClose={onCloseUpdateProperty}
          onSave={onSaveUpdateProperty}
        />
      )}
      {showAddProperty && (
        <AddPropertyModal onClose={onCloseAddProperty} onSave={onSaveAddProperty} />
      )}
      {modalProperty && (
        <AddPropertyTxnModal
          property={modalProperty}
          existing={editingPropertyTxn ?? undefined}
          mortgageBalance={getPropertyMortgageBalance(modalProperty, mortgageById)}
          onClose={onCloseAddPropertyTxn}
          onSave={onSavePropertyTxn}
        />
      )}
    </>
  );
}

export function InvestmentModals({ holdingModals, propertyModals }: InvestmentModalsProps) {
  return (
    <>
      <HoldingModals {...holdingModals} />
      <PropertyModals {...propertyModals} />
    </>
  );
}
