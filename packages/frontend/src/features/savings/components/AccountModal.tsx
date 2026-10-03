import { DATA_COLORS } from '@/lib/dataColors';
import { useState } from 'react';
import { Trash2, Check } from 'lucide-react';
import { CURRENCY_CODES } from '@/lib/CurrencyContext';
import type { CurrencyCode } from '@/lib/CurrencyContext';
import { isSingleEmoji } from '@/lib/emoji';
import { formatFixedInputValue } from '@/lib/utils';
import {
  ArchiveOrDeleteDialog,
  Modal,
  ModalFooter,
  FormField,
  TextInput,
  SelectInput,
  EmojiPickerField,
  IconButton,
} from '@/components/ui';
import { monthlyInterest, type SavingsAccount } from '@quro/shared';
import { JointToggleField } from '@/features/partner';
import type { DeleteSavingsAccountMode, SaveAccountInput } from '../types';

type AccountModalProps = {
  existing?: SavingsAccount;
  onClose: () => void;
  onSave: (account: SaveAccountInput) => Promise<void>;
  onDelete?: (id: number, mode: DeleteSavingsAccountMode) => Promise<void>;
};

const ACCOUNT_TYPES: ('Easy Access' | 'Term Deposit')[] = ['Easy Access', 'Term Deposit'];
const COLORS = [
  DATA_COLORS['primary'],
  DATA_COLORS['cash'],
  DATA_COLORS['income'],
  DATA_COLORS['forecast'],
  DATA_COLORS['property'],
  DATA_COLORS['milestone'],
  DATA_COLORS['portfolio'],
  DATA_COLORS['recurring'],
];

type FormState = {
  name: string;
  bank: string;
  balance: string;
  currency: CurrencyCode;
  rate: string;
  type: 'Easy Access' | 'Term Deposit';
  emoji: string;
  isJoint: boolean;
};

function validateAccountForm(form: FormState): Record<string, string> {
  const errs: Record<string, string> = {};
  const emoji = form.emoji.trim();
  if (!form.name.trim()) errs.name = 'Required';
  if (!form.bank.trim()) errs.bank = 'Required';
  if (!form.balance || isNaN(parseFloat(form.balance)) || parseFloat(form.balance) < 0)
    errs.balance = 'Enter a valid amount';
  if (!form.rate || isNaN(parseFloat(form.rate))) errs.rate = 'Enter a valid rate';
  if (!isSingleEmoji(emoji)) errs.emoji = 'Pick an emoji';
  return errs;
}

function initialFormState(existing?: SavingsAccount): FormState {
  if (!existing) {
    return {
      name: '',
      bank: '',
      balance: '',
      currency: 'EUR',
      rate: '',
      type: 'Easy Access',
      emoji: '\ud83c\udfe6',
      isJoint: false,
    };
  }
  return {
    name: existing.name,
    bank: existing.bank,
    balance: formatFixedInputValue(existing.balance),
    currency: existing.currency as CurrencyCode,
    rate: formatFixedInputValue(existing.interestRate),
    type: existing.accountType as 'Easy Access' | 'Term Deposit',
    emoji: existing.emoji,
    isJoint: existing.isJoint,
  };
}

function InterestPreview({
  balance,
  rate,
  currency,
}: {
  balance: string;
  rate: string;
  currency: string;
}) {
  if (!balance || !rate) return null;
  const monthly = monthlyInterest(parseFloat(balance), parseFloat(rate)).toFixed(2);
  return (
    <div className="bg-success-soft border border-success-soft-strong rounded-xl p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Check size={14} className="text-success" />
        <span className="text-sm text-success-fg">Monthly interest preview</span>
      </div>
      <span className="text-sm font-bold text-success-fg">
        {currency} {monthly}/mo
      </span>
    </div>
  );
}

type AccountFormBodyProps = {
  form: FormState;
  errors: Record<string, string>;
  set: (field: string, value: string | boolean) => void;
  isBunqSynced?: boolean;
};

function AccountBasicFields({ form, errors, set }: AccountFormBodyProps) {
  return (
    <>
      <div className="flex gap-3">
        <EmojiPickerField
          value={form.emoji}
          onChange={(emoji) => set('emoji', emoji)}
          error={errors.emoji}
        />
        <FormField label="Account Name" required error={errors.name} className="flex-1">
          <TextInput
            data-testid="savings-account-name-input"
            value={form.name}
            onChange={(v) => set('name', v)}
            error={Boolean(errors.name)}
            placeholder="e.g. ASN Spaarrekening"
          />
        </FormField>
      </div>
      <FormField label="Bank / Provider" required error={errors.bank}>
        <TextInput
          data-testid="savings-account-bank-input"
          value={form.bank}
          onChange={(v) => set('bank', v)}
          error={Boolean(errors.bank)}
          placeholder="e.g. Rabobank"
        />
      </FormField>
    </>
  );
}

function AccountAmountFields({
  form,
  errors,
  set,
  balanceLabel,
  isBunqSynced = false,
}: AccountFormBodyProps & { balanceLabel: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField label={balanceLabel} required error={errors.balance}>
          <TextInput
            data-testid="savings-account-balance-input"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={form.balance}
            onChange={(v) => {
              if (!isBunqSynced) set('balance', v);
            }}
            error={Boolean(errors.balance)}
            placeholder="18500.00"
            disabled={isBunqSynced}
          />
        </FormField>
        <FormField label="Currency">
          <SelectInput
            value={form.currency}
            onChange={(v) => {
              if (!isBunqSynced) set('currency', v);
            }}
            options={CURRENCY_CODES.map((c) => ({ value: c, label: c }))}
            disabled={isBunqSynced}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Interest Rate (% APY)" required error={errors.rate}>
          <TextInput
            data-testid="savings-account-rate-input"
            type="number"
            step="0.01"
            value={form.rate}
            onChange={(v) => set('rate', v)}
            error={Boolean(errors.rate)}
            placeholder="3.50"
          />
        </FormField>
        <FormField label="Account Type">
          <SelectInput value={form.type} onChange={(v) => set('type', v)} options={ACCOUNT_TYPES} />
        </FormField>
      </div>
    </>
  );
}

function AccountFormBody({
  form,
  errors,
  set,
  isEdit,
  isBunqSynced = false,
}: AccountFormBodyProps & { isEdit: boolean; isBunqSynced?: boolean }) {
  return (
    <>
      <AccountBasicFields form={form} errors={errors} set={set} />
      <AccountAmountFields
        form={form}
        errors={errors}
        set={set}
        balanceLabel={isEdit ? 'Balance' : 'Opening Balance'}
        isBunqSynced={isBunqSynced}
      />
      <JointToggleField checked={form.isJoint} onChange={(checked) => set('isJoint', checked)} />
      <InterestPreview balance={form.balance} rate={form.rate} currency={form.currency} />
    </>
  );
}

function useAccountModalForm(
  existing: SavingsAccount | undefined,
  onSave: (account: SaveAccountInput) => Promise<void>,
  onClose: () => void,
) {
  const [form, setForm] = useState<FormState>(initialFormState(existing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set(field: string, value: string | boolean): void {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field])
      setErrors((e) => {
        const n = { ...e };
        delete n[field];
        return n;
      });
  }

  async function handleSave(): Promise<void> {
    setSubmitError(null);
    const errs = validateAccountForm(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    try {
      await onSave({
        ...(existing ? { id: existing.id } : {}),
        name: form.name.trim(),
        bank: form.bank.trim(),
        balance: parseFloat(form.balance),
        currency: form.currency,
        interestRate: parseFloat(form.rate),
        accountType: form.type,
        color: existing?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
        emoji: form.emoji.trim(),
        isJoint: form.isJoint,
      });
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to save account');
    }
  }

  return { form, errors, submitError, set, handleSave, setSubmitError };
}

function SubmitError({ message }: Readonly<{ message: string | null }>) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-danger-soft-strong bg-danger-soft px-3 py-2 text-sm text-danger-hover">
      {message}
    </div>
  );
}

export function AccountModal({ existing, onClose, onSave, onDelete }: AccountModalProps) {
  const { form, errors, submitError, set, handleSave, setSubmitError } = useAccountModalForm(
    existing,
    onSave,
    onClose,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isEdit = Boolean(existing);
  const isBunqSynced = Boolean(existing?.bunqAccountId);

  const deleteButton =
    existing && onDelete ? (
      <IconButton
        icon={Trash2}
        label="Remove account"
        variant="danger"
        size="lg"
        className="border border-danger-border text-danger"
        onClick={() => setConfirmingDelete(true)}
      />
    ) : undefined;

  const runDelete = (mode: DeleteSavingsAccountMode) => {
    if (!existing || !onDelete) return;
    void (async () => {
      setSubmitError(null);
      try {
        await onDelete(existing.id, mode);
        onClose();
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : 'Failed to delete account');
      }
    })();
  };

  return (
    <Modal
      title={isEdit ? 'Edit Account' : 'Add Savings Account'}
      subtitle={isEdit ? 'Update account details' : 'Link a new account'}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => {
            void handleSave();
          }}
          confirmLabel={isEdit ? 'Save Changes' : 'Add Account'}
          danger={deleteButton}
        />
      }
    >
      <SubmitError message={submitError} />
      <AccountFormBody
        form={form}
        errors={errors}
        set={set}
        isEdit={isEdit}
        isBunqSynced={isBunqSynced}
      />
      {confirmingDelete && existing ? (
        <ArchiveOrDeleteDialog
          entityLabel="Account"
          entityName={existing.name}
          balance={existing.balance}
          balanceCurrency={existing.currency}
          childrenLabel="transactions"
          onArchive={() => {
            runDelete('preserveTransactions');
            setConfirmingDelete(false);
          }}
          onDelete={() => {
            runDelete('deleteTransactions');
            setConfirmingDelete(false);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : null}
    </Modal>
  );
}
