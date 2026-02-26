import { useState } from 'react';
import { CURRENCY_LIST, type CurrencyCode } from '@/lib/CurrencyContext';
import { isSingleEmoji } from '@/lib/emoji';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { FormField, TextInput, SelectInput } from '@/components/ui/FormField';
import { EmojiPickerField } from '@/components/ui/EmojiPickerField';
import type { PensionPot } from '@quro/shared';
import { PENSION_TYPES, PALETTE } from '../constants';

// ─── Types ───────────────────────────────────────────────────────────────────

type PensionModalProps = {
  existing?: PensionPot;
  onClose: () => void;
  onSave: (p: PensionPot | Omit<PensionPot, 'id'>) => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function PensionModal({ existing, onClose, onSave }: PensionModalProps): JSX.Element {
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    provider: existing?.provider ?? '',
    type: existing?.type ?? 'Workplace',
    balance: existing?.balance.toString() ?? '',
    currency: existing?.currency ?? ('EUR' as CurrencyCode),
    employeeMonthly: existing?.employeeMonthly.toString() ?? '',
    employerMonthly: existing?.employerMonthly.toString() ?? '',
    notes: existing?.notes ?? '',
    emoji: existing?.emoji ?? '\uD83C\uDFE6',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(field: string, value: string): void {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[field];
        return next;
      });
    }
  }

  function handleSave(): void {
    const errs: Record<string, string> = {};
    const emoji = form.emoji.trim();
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.provider.trim()) errs.provider = 'Required';
    if (!form.balance || isNaN(parseFloat(form.balance))) errs.balance = 'Enter a valid amount';
    if (!isSingleEmoji(emoji)) errs.emoji = 'Pick an emoji';
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    const potData = {
      name: form.name.trim(),
      provider: form.provider.trim(),
      type: form.type as PensionPot['type'],
      balance: parseFloat(form.balance),
      currency: form.currency as CurrencyCode,
      employeeMonthly: parseFloat(form.employeeMonthly) || 0,
      employerMonthly: parseFloat(form.employerMonthly) || 0,
      color: existing?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)],
      emoji,
      notes: form.notes,
    };

    if (existing) {
      onSave({ id: existing.id, ...potData });
    } else {
      onSave(potData);
    }
    onClose();
  }

  const title = existing ? 'Edit Pension Pot' : 'Add Pension Pot';
  const confirmLabel = existing ? 'Save Changes' : 'Add Pot';

  return (
    <Modal
      title={title}
      subtitle="Track your pension balance across currencies"
      onClose={onClose}
      scrollable
      footer={<ModalFooter onCancel={onClose} onConfirm={handleSave} confirmLabel={confirmLabel} />}
    >
      {/* Emoji + Name */}
      <div className="flex gap-3">
        <EmojiPickerField
          value={form.emoji}
          onChange={(emoji) => set('emoji', emoji)}
          error={errors.emoji}
          containerClassName="w-20 flex-shrink-0"
          buttonClassName="w-full"
        />
        <FormField label="Pension Name" required error={errors.name} className="flex-1">
          <TextInput
            value={form.name}
            onChange={(v) => set('name', v)}
            error={Boolean(errors.name)}
            placeholder="e.g. ABP Workplace Pension"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Provider" required error={errors.provider}>
          <TextInput
            value={form.provider}
            onChange={(v) => set('provider', v)}
            error={Boolean(errors.provider)}
            placeholder="e.g. ABP, AustralianSuper"
          />
        </FormField>
        <FormField label="Type">
          <SelectInput
            value={form.type}
            onChange={(v) => set('type', v)}
            options={PENSION_TYPES.map((t) => t)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Opening Balance" required error={errors.balance}>
          <TextInput
            type="number"
            value={form.balance}
            onChange={(v) => set('balance', v)}
            error={Boolean(errors.balance)}
            placeholder="48200"
          />
        </FormField>
        <FormField label="Currency">
          <SelectInput
            value={form.currency}
            onChange={(v) => set('currency', v)}
            options={CURRENCY_LIST.map((c) => c)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Your Contribution /mo">
          <TextInput
            type="number"
            value={form.employeeMonthly}
            onChange={(v) => set('employeeMonthly', v)}
            placeholder="325"
          />
        </FormField>
        <FormField label="Employer Match /mo">
          <TextInput
            type="number"
            value={form.employerMonthly}
            onChange={(v) => set('employerMonthly', v)}
            placeholder="195"
          />
        </FormField>
      </div>

      <FormField label="Notes" hint="optional">
        <textarea
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          placeholder="Any notes about this pension pot..."
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </FormField>
    </Modal>
  );
}
