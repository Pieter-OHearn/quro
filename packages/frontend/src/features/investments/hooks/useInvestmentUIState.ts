import { useState } from 'react';
import type { Holding, Property } from '@quro/shared';
import type { InvestmentUIState, Tab } from '../types';

export function useInvestmentUIState(): InvestmentUIState {
  const [tab, setTab] = useState<Tab>('brokerage');
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [addTxnForHolding, setAddTxnForHolding] = useState<Holding | null>(null);
  const [expandedHoldingId, setExpandedHoldingId] = useState<number | null>(null);
  const [updatingProperty, setUpdatingProperty] = useState<Property | null>(null);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [addTxnForProperty, setAddTxnForProperty] = useState<Property | null>(null);
  const [expandedPropertyId, setExpandedPropertyId] = useState<number | null>(null);

  return {
    tab,
    editingHolding,
    showAddHolding,
    addTxnForHolding,
    expandedHoldingId,
    updatingProperty,
    showAddProperty,
    addTxnForProperty,
    expandedPropertyId,
    setTab,
    setEditingHolding,
    setShowAddHolding,
    setAddTxnForHolding,
    setExpandedHoldingId,
    setUpdatingProperty,
    setShowAddProperty,
    setAddTxnForProperty,
    setExpandedPropertyId,
  };
}
