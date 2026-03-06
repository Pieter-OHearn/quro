import type { Holding, HoldingTransaction, Mortgage, Property } from '@quro/shared';
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
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
  positions: Record<number, Position>,
): HoldingModalsProps {
  return {
    showAddHolding: ui.showAddHolding,
    editingHolding: ui.editingHolding,
    addTxnForHolding: ui.addTxnForHolding,
    editingHoldingTxn: ui.editingHoldingTxn,
    holdings,
    holdingTxns,
    positions,
    onCloseEditHolding: () => {
      ui.setShowAddHolding(false);
      ui.setEditingHolding(null);
    },
    onSaveHolding: actions.handleSaveHolding,
    onDeleteHolding: actions.handleDeleteHolding,
    onCloseAddHoldingTxn: () => {
      ui.setAddTxnForHolding(null);
      ui.setEditingHoldingTxn(null);
    },
    onSaveHoldingTxn: actions.handleAddHoldingTxn,
  };
}

export function buildPropertyModalsProps(
  ui: InvestmentUIState,
  actions: InvestmentActions,
  properties: Property[],
  mortgageById: Map<number, Mortgage>,
): PropertyModalsProps {
  return {
    updatingProperty: ui.updatingProperty,
    showAddProperty: ui.showAddProperty,
    addTxnForProperty: ui.addTxnForProperty,
    editingPropertyTxn: ui.editingPropertyTxn,
    properties,
    mortgageById,
    onCloseUpdateProperty: () => ui.setUpdatingProperty(null),
    onSaveUpdateProperty: actions.handleUpdateProperty,
    onCloseAddProperty: () => ui.setShowAddProperty(false),
    onSaveAddProperty: actions.handleSaveProperty,
    onCloseAddPropertyTxn: () => {
      ui.setAddTxnForProperty(null);
      ui.setEditingPropertyTxn(null);
    },
    onSavePropertyTxn: actions.handleAddPropertyTxn,
  };
}
