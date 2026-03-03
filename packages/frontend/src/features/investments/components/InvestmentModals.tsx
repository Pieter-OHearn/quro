import { AddHoldingTxnModal } from './AddHoldingTxnModal';
import { AddPropertyModal } from './AddPropertyModal';
import { AddPropertyTxnModal } from './AddPropertyTxnModal';
import { EditHoldingModal } from './EditHoldingModal';
import { UpdatePropertyModal } from './UpdatePropertyModal';
import type { HoldingModalsProps, PropertyModalsProps } from '../types';
import { EMPTY_POSITION } from '../utils/portfolio';
import { getPropertyMortgageBalance } from '../utils/position';

type InvestmentModalsProps = {
  holdingModals: HoldingModalsProps;
  propertyModals: PropertyModalsProps;
};

function HoldingModals({
  showAddHolding,
  editingHolding,
  addTxnForHolding,
  positions,
  onCloseEditHolding,
  onSaveHolding,
  onDeleteHolding,
  onCloseAddHoldingTxn,
  onSaveHoldingTxn,
}: HoldingModalsProps) {
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
      {addTxnForHolding && (
        <AddHoldingTxnModal
          holding={addTxnForHolding}
          currentPosition={positions[addTxnForHolding.id] ?? EMPTY_POSITION}
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
  mortgageById,
  onCloseUpdateProperty,
  onSaveUpdateProperty,
  onCloseAddProperty,
  onSaveAddProperty,
  onCloseAddPropertyTxn,
  onSavePropertyTxn,
}: PropertyModalsProps) {
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
      {addTxnForProperty && (
        <AddPropertyTxnModal
          property={addTxnForProperty}
          mortgageBalance={getPropertyMortgageBalance(addTxnForProperty, mortgageById)}
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
