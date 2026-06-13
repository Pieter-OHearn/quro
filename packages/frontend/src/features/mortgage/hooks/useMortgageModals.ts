import { useState } from 'react';
import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';

export function useMortgageModals() {
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState<MortgageTransaction | null>(null);
  const [showMortgageModal, setShowMortgageModal] = useState(false);
  const [editingMortgage, setEditingMortgage] = useState<MortgageType | null>(null);

  const closeTxnModal = () => {
    setShowTxnModal(false);
    setEditingTxn(null);
  };

  const closeMortgageModal = () => {
    setShowMortgageModal(false);
    setEditingMortgage(null);
  };

  return {
    showTxnModal,
    setShowTxnModal,
    editingTxn,
    setEditingTxn,
    closeTxnModal,
    showMortgageModal,
    setShowMortgageModal,
    editingMortgage,
    setEditingMortgage,
    closeMortgageModal,
  };
}
