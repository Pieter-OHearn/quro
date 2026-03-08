import { useState } from 'react';
import { CURRENCY_CODES, type CurrencyCode } from '@/lib/CurrencyContext';
import { isSingleEmoji } from '@/lib/emoji';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { FormField, TextInput, SelectInput } from '@/components/ui/FormField';
import { EmojiPickerField } from '@/components/ui/EmojiPickerField';
import type { PensionPot } from '@quro/shared';
import { PENSION_TYPES, PALETTE } from '../constants';

type PensionModalProps = {
  existing?: PensionPot;
  onClose: () => void;
  onSave: (p: PensionPot | Omit<PensionPot, 'id'>) => void;
};

type MetadataEntry = {
  id: string;
  key: string;
  value: string;
};

type MetadataEditableField = 'key' | 'value';

type PensionFormState = {
  name: string;
  provider: string;
  type: string;
  balance: string;
  currency: CurrencyCode;
  employeeMonthly: string;
  employerMonthly: string;
  investmentStrategy: string;
  notes: string;
  emoji: string;
};

const validatePensionForm = (form: PensionFormState): Record<string, string> => {
  const errs: Record<string, string> = {};
  if (!form.name.trim()) errs.name = 'Required';
  if (!form.provider.trim()) errs.provider = 'Required';
  if (!form.balance || Number.isNaN(parseFloat(form.balance)))
    errs.balance = 'Enter a valid amount';
  if (!isSingleEmoji(form.emoji.trim())) errs.emoji = 'Pick an emoji';
  return errs;
};

function buildMetadataRecord(entries: MetadataEntry[]): Record<string, string> {
  return entries.reduce<Record<string, string>>((acc, entry) => {
    const key = entry.key.trim();
    if (!key) return acc;
    acc[key] = entry.value.trim();
    return acc;
  }, {});
}

function createMetadataEntry(key = '', value = ''): MetadataEntry {
  return {
    id: crypto.randomUUID(),
    key,
    value,
  };
}

const buildPotData = (
  form: PensionFormState,
  metadataEntries: MetadataEntry[],
  existing: PensionPot | undefined,
) => ({
  name: form.name.trim(),
  provider: form.provider.trim(),
  type: form.type as PensionPot['type'],
  balance: parseFloat(form.balance),
  currency: form.currency,
  employeeMonthly: parseFloat(form.employeeMonthly) || 0,
  employerMonthly: parseFloat(form.employerMonthly) || 0,
  investmentStrategy: form.investmentStrategy.trim() || null,
  metadata: buildMetadataRecord(metadataEntries),
  color: existing?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)],
  emoji: form.emoji.trim(),
  notes: form.notes,
});

type PensionFormFields = {
  form: PensionFormState;
  errors: Record<string, string>;
  set: (field: keyof PensionFormState, value: string) => void;
};

function PensionEmojiNameRow({ form, errors, set }: Readonly<PensionFormFields>) {
  return (
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
  );
}

function PensionProviderTypeRow({ form, errors, set }: Readonly<PensionFormFields>) {
  return (
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
  );
}

function PensionBalanceCurrencyRow({ form, errors, set }: Readonly<PensionFormFields>) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField label="Current Balance" required error={errors.balance}>
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
          options={CURRENCY_CODES.map((c) => c)}
        />
      </FormField>
    </div>
  );
}

function PensionContributionsRow({ form, set }: Readonly<Omit<PensionFormFields, 'errors'>>) {
  return (
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
  );
}

function PensionStrategyField({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (value: string) => void }>) {
  return (
    <FormField label="Investment Strategy" hint="optional">
      <TextInput value={value} onChange={onChange} placeholder="e.g. High growth" />
    </FormField>
  );
}

function PensionMetadataEditor({
  entries,
  onChangeEntry,
  onAddEntry,
  onRemoveEntry,
}: Readonly<{
  entries: MetadataEntry[];
  onChangeEntry: (index: number, field: MetadataEditableField, value: string) => void;
  onAddEntry: () => void;
  onRemoveEntry: (index: number) => void;
}>) {
  return (
    <FormField label="Additional Metadata" hint="optional key/value pairs">
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div key={entry.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <TextInput
              value={entry.key}
              onChange={(value) => onChangeEntry(index, 'key', value)}
              placeholder="Key"
            />
            <TextInput
              value={entry.value}
              onChange={(value) => onChangeEntry(index, 'value', value)}
              placeholder="Value"
            />
            <button
              type="button"
              onClick={() => onRemoveEntry(index)}
              className="rounded-lg border border-slate-200 px-2 text-xs text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAddEntry}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Add metadata row
        </button>
      </div>
    </FormField>
  );
}

function PensionNotesField({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (v: string) => void }>) {
  return (
    <FormField label="Notes" hint="optional">
      <textarea
        rows={2}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
        placeholder="Any notes about this pension pot..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

function buildInitialMetadataEntries(existing: PensionPot | undefined): MetadataEntry[] {
  const entries = Object.entries(existing?.metadata ?? {}).map(([key, value]) =>
    createMetadataEntry(key, value),
  );

  return entries.length > 0 ? entries : [createMetadataEntry()];
}

function buildInitialPensionState(existing: PensionPot | undefined): PensionFormState {
  if (!existing) {
    return {
      name: '',
      provider: '',
      type: 'Workplace Pension',
      balance: '',
      currency: 'EUR' as CurrencyCode,
      employeeMonthly: '',
      employerMonthly: '',
      investmentStrategy: '',
      notes: '',
      emoji: '\uD83C\uDFE6',
    };
  }
  return {
    name: existing.name,
    provider: existing.provider,
    type: existing.type,
    balance: existing.balance.toString(),
    currency: existing.currency as CurrencyCode,
    employeeMonthly: existing.employeeMonthly.toString(),
    employerMonthly: existing.employerMonthly.toString(),
    investmentStrategy: existing.investmentStrategy ?? '',
    notes: existing.notes,
    emoji: existing.emoji,
  };
}

export function PensionModal({ existing, onClose, onSave }: PensionModalProps): JSX.Element {
  const [form, setForm] = useState<PensionFormState>(() => buildInitialPensionState(existing));
  const [metadataEntries, setMetadataEntries] = useState<MetadataEntry[]>(() =>
    buildInitialMetadataEntries(existing),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isEdit = Boolean(existing);

  const set = (field: keyof PensionFormState, value: string): void => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field])
      setErrors((e) => {
        const next = { ...e };
        delete next[field];
        return next;
      });
  };

  const handleMetadataEntryChange = (
    index: number,
    field: MetadataEditableField,
    value: string,
  ): void => {
    setMetadataEntries((entries) =>
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const handleAddMetadataEntry = (): void => {
    setMetadataEntries((entries) => [...entries, createMetadataEntry()]);
  };

  const handleRemoveMetadataEntry = (index: number): void => {
    setMetadataEntries((entries) => {
      const next = entries.filter((_, entryIndex) => entryIndex !== index);
      return next.length > 0 ? next : [createMetadataEntry()];
    });
  };

  const handleSave = (): void => {
    const errs = validatePensionForm(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    const potData = buildPotData(form, metadataEntries, existing);
    onSave(existing ? { id: existing.id, ...potData } : potData);
    onClose();
  };

  return (
    <Modal
      title={isEdit ? 'Edit Pension Pot' : 'Add Pension Pot'}
      subtitle="Track your pension balance across currencies"
      onClose={onClose}
      scrollable
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={isEdit ? 'Save Changes' : 'Add Pot'}
        />
      }
    >
      <PensionEmojiNameRow form={form} errors={errors} set={set} />
      <PensionProviderTypeRow form={form} errors={errors} set={set} />
      <PensionBalanceCurrencyRow form={form} errors={errors} set={set} />
      <PensionContributionsRow form={form} set={set} />
      <PensionStrategyField
        value={form.investmentStrategy}
        onChange={(value) => set('investmentStrategy', value)}
      />
      <PensionMetadataEditor
        entries={metadataEntries}
        onChangeEntry={handleMetadataEntryChange}
        onAddEntry={handleAddMetadataEntry}
        onRemoveEntry={handleRemoveMetadataEntry}
      />
      <PensionNotesField value={form.notes} onChange={(v) => set('notes', v)} />
    </Modal>
  );
}
