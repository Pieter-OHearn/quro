import { useState } from 'react';
import { Trash2, Check } from 'lucide-react';
import { CURRENCY_LIST } from '@/lib/CurrencyContext';
import type { CurrencyCode } from '@/lib/CurrencyContext';
import { isSingleEmoji } from '@/lib/emoji';
import {
  Modal,
  ModalFooter,
  FormField,
  TextInput,
  SelectInput,
  EmojiPickerField,
} from '@/components/ui';
import type { SavingsAccount } from '@quro/shared';

type AccountModalProps = {
  existing?: SavingsAccount;
  onClose: () => void;
  onSave: (a: Omit<SavingsAccount, 'id'> & { id?: number }) => void;
  onDelete?: (id: number) => void;
};

const ACCOUNT_TYPES: ('Easy Access' | 'Term Deposit')[] = ['Easy Access', 'Term Deposit'];
const COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#f97316',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
];

type FormState = {
  name: string;
  bank: string;
  balance: string;
  currency: CurrencyCode;
  rate: string;
  type: 'Easy Access' | 'Term Deposit';
  emoji: string;
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
    return { name: '', bank: '', balance: '', currency: 'EUR', rate: '', type: 'Easy Access', emoji: '\ud83c\udfe6' };
  }
  return {
    name: existing.name,
    bank: existing.bank,
    balance: existing.balance.toString(),
    currency: existing.currency as CurrencyCode,
    rate: existing.interestRate.toString(),
    type: existing.accountType as 'Easy Access' | 'Term Deposit',
    emoji: existing.emoji,
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
  const monthly = ((parseFloat(balance) * parseFloat(rate)) / 100 / 12).toFixed(2);
  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Check size={14} className="text-emerald-600" />
        <span className="text-sm text-emerald-700">Monthly interest preview</span>
      </div>
      <span className="text-sm font-bold text-emerald-700">
        {currency} {monthly}/mo
      </span>
    </div>
  );
}

type AccountFormBodyProps = {
  form: FormState;
  errors: Record<string, string>;
  set: (field: string, value: string) => void;
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
            value={form.name}
            onChange={(v) => set('name', v)}
            error={Boolean(errors.name)}
            placeholder="e.g. ASN Spaarrekening"
          />
        </FormField>
      </div>
      <FormField label="Bank / Provider" required error={errors.bank}>
        <TextInput
          value={form.bank}
          onChange={(v) => set('bank', v)}
          error={Boolean(errors.bank)}
          placeholder="e.g. Rabobank"
        />
      </FormField>
    </>
  );
}

function AccountAmountFields({ form, errors, set }: AccountFormBodyProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Opening Balance" required error={errors.balance}>
          <TextInput
            type="number"
            value={form.balance}
            onChange={(v) => set('balance', v)}
            error={Boolean(errors.balance)}
            placeholder="18500"
          />
        </FormField>
        <FormField label="Currency">
          <SelectInput
            value={form.currency}
            onChange={(v) => set('currency', v)}
            options={CURRENCY_LIST.map((c) => ({ value: c, label: c }))}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Interest Rate (% APY)" required error={errors.rate}>
          <TextInput
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

function AccountFormBody({ form, errors, set }: AccountFormBodyProps) {
  return (
    <>
      <AccountBasicFields form={form} errors={errors} set={set} />
      <AccountAmountFields form={form} errors={errors} set={set} />
      <InterestPreview balance={form.balance} rate={form.rate} currency={form.currency} />
    </>
  );
}

function useAccountModalForm(
  existing: SavingsAccount | undefined,
  onSave: (a: Omit<SavingsAccount, 'id'> & { id?: number }) => void,
  onClose: () => void,
) {
  const [form, setForm] = useState<FormState>(initialFormState(existing));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(field: string, value: string): void {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field])
      setErrors((e) => {
        const n = { ...e };
        delete n[field];
        return n;
      });
  }

  function handleSave(): void {
    const errs = validateAccountForm(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave({
      ...(existing ? { id: existing.id } : {}),
      name: form.name.trim(),
      bank: form.bank.trim(),
      balance: parseFloat(form.balance),
      currency: form.currency,
      interestRate: parseFloat(form.rate),
      accountType: form.type,
      color: existing?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
      emoji: form.emoji.trim(),
    });
    onClose();
  }

  return { form, errors, set, handleSave };
}

export function AccountModal({ existing, onClose, onSave, onDelete }: AccountModalProps) {
  const { form, errors, set, handleSave } = useAccountModalForm(existing, onSave, onClose);

  const deleteButton =
    existing && onDelete ? (
      <button
        onClick={() => {
          onDelete(existing.id);
          onClose();
        }}
        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 text-sm transition-colors"
        title="Delete account"
      >
        <Trash2 size={14} />
      </button>
    ) : undefined;

  return (
    <Modal
      title={existing ? 'Edit Account' : 'Add Savings Account'}
      subtitle={existing ? 'Update account details' : 'Link a new account'}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={existing ? 'Save Changes' : 'Add Account'}
          danger={deleteButton}
        />
      }
    >
      <AccountFormBody form={form} errors={errors} set={set} />
    </Modal>
  );
}
