import { useEffect, useState } from 'react';
import { EmojiPickerField, FormField, Modal, ModalFooter } from '@/components/ui';
import type { BudgetCategory, EditCategoryForm } from '../types';

const PRESET_COLORS = [
  '#22c55e',
  '#f97316',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#f43f5e',
  '#0ea5e9',
  '#94a3b8',
];

type ColorSwatchesProps = { selected: string; onSelect: (color: string) => void };

function ColorSwatches({ selected, onSelect }: Readonly<ColorSwatchesProps>) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onSelect(color)}
          style={{ backgroundColor: color }}
          className="h-7 w-7 rounded-full transition-transform hover:scale-110"
          aria-label={color}
        >
          {selected === color && (
            <span className="flex items-center justify-center text-white text-xs font-bold">✓</span>
          )}
        </button>
      ))}
    </div>
  );
}

type EditCategoryDialogProps = {
  category: BudgetCategory;
  isSaving: boolean;
  onSave: (form: EditCategoryForm) => void;
  onClose: () => void;
};

export function EditCategoryDialog({
  category,
  isSaving,
  onSave,
  onClose,
}: Readonly<EditCategoryDialogProps>) {
  const [form, setForm] = useState<EditCategoryForm>({
    name: category.name,
    emoji: category.emoji,
    budgeted: String(category.budgeted),
    color: category.color,
  });

  useEffect(() => {
    setForm({
      name: category.name,
      emoji: category.emoji,
      budgeted: String(category.budgeted),
      color: category.color,
    });
  }, [category]);

  const set = <K extends keyof EditCategoryForm>(key: K, value: EditCategoryForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      title="Edit category"
      subtitle={`${category.month} ${category.year}`}
      onClose={onClose}
      maxWidth="sm"
      footer={
        <ModalFooter
          confirmLabel={isSaving ? 'Saving…' : 'Save'}
          disabled={isSaving}
          onConfirm={() => onSave(form)}
          onCancel={onClose}
        />
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          <EmojiPickerField label="Icon" value={form.emoji} onChange={(e) => set('emoji', e)} />
          <FormField label="Name" className="flex-1">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Monthly budget (€)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={form.budgeted}
            onChange={(e) => set('budgeted', e.target.value)}
          />
        </FormField>
        <FormField label="Colour">
          <ColorSwatches selected={form.color} onSelect={(c) => set('color', c)} />
        </FormField>
      </div>
    </Modal>
  );
}
