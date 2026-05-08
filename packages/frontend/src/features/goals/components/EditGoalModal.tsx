import { Modal, ModalFooter } from '@/components/ui';
import type { Goal } from '@quro/shared';
import { useEditGoalModal } from '../hooks/useEditGoalModal';
import { GOAL_TYPE_META } from '../utils/goals-constants';
import type { UpdateGoalInput } from '../types';
import { GoalDetailsStep } from './AddGoalModal';

type EditGoalModalProps = {
  goal: Goal;
  onClose: () => void;
  onSave: (input: UpdateGoalInput) => void;
};

export function EditGoalModal({ goal, onClose, onSave }: Readonly<EditGoalModalProps>) {
  const {
    baseCurrency,
    convertToBase,
    fmtBase,
    savingsAccounts,
    loadingSavingsAccounts,
    portfolioTotal,
    netWorth,
    type,
    form,
    setField,
    handleSave,
    saveDisabled,
  } = useEditGoalModal(goal, onSave, onClose);

  const subtitle = `${GOAL_TYPE_META[type].label} — edit goal details`;

  return (
    <Modal
      title="Edit Goal"
      subtitle={subtitle}
      onClose={onClose}
      maxWidth="lg"
      scrollable
      bodyClassName="p-0 space-y-0"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel="Update Goal"
          disabled={saveDisabled}
        />
      }
    >
      <GoalDetailsStep
        type={type}
        form={form}
        setField={setField}
        baseCurrency={baseCurrency}
        savingsAccounts={savingsAccounts}
        loadingSavingsAccounts={loadingSavingsAccounts}
        convertToBase={convertToBase}
        fmtBase={fmtBase}
        portfolioTotal={portfolioTotal}
        netWorth={netWorth}
        onBack={onClose}
      />
    </Modal>
  );
}
