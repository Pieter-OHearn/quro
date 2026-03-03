import type { Mortgage } from '@quro/shared';
import type {
  HoldingModalsProps,
  InvestmentActions,
  InvestmentUIState,
  PropertyModalsProps,
} from '../types';
import type { Position } from './position';

export function buildHoldingModalsProps(
  ui: InvestmentUIState,
  actions: InvestmentActions,
  positions: Record<number, Position>,
): HoldingModalsProps {
  return {
    showAddHolding: ui.showAddHolding,
    editingHolding: ui.editingHolding,
    addTxnForHolding: ui.addTxnForHolding,
    positions,
    onCloseEditHolding: () => {
      ui.setShowAddHolding(false);
      ui.setEditingHolding(null);
    },
    onSaveHolding: actions.handleSaveHolding,
    onDeleteHolding: actions.handleDeleteHolding,
    onCloseAddHoldingTxn: () => ui.setAddTxnForHolding(null),
    onSaveHoldingTxn: actions.handleAddHoldingTxn,
  };
}

export function buildPropertyModalsProps(
  ui: InvestmentUIState,
  actions: InvestmentActions,
  mortgageById: Map<number, Mortgage>,
): PropertyModalsProps {
  return {
    updatingProperty: ui.updatingProperty,
    showAddProperty: ui.showAddProperty,
    addTxnForProperty: ui.addTxnForProperty,
    mortgageById,
    onCloseUpdateProperty: () => ui.setUpdatingProperty(null),
    onSaveUpdateProperty: actions.handleUpdateProperty,
    onCloseAddProperty: () => ui.setShowAddProperty(false),
    onSaveAddProperty: actions.handleSaveProperty,
    onCloseAddPropertyTxn: () => ui.setAddTxnForProperty(null),
    onSavePropertyTxn: actions.handleAddPropertyTxn,
  };
}
