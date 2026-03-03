import { useState } from 'react';
import type { Mortgage as MortgageType } from '@quro/shared';

export function useMortgageModals() {
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showMortgageModal, setShowMortgageModal] = useState(false);
  const [editingMortgage, setEditingMortgage] = useState<MortgageType | null>(null);

  const closeMortgageModal = () => {
    setShowMortgageModal(false);
    setEditingMortgage(null);
  };

  return {
    showTxnModal,
    setShowTxnModal,
    showMortgageModal,
    setShowMortgageModal,
    editingMortgage,
    setEditingMortgage,
    closeMortgageModal,
  };
}
