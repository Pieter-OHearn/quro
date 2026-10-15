import {
  CATEGORY_COLOR_NAMES,
  CATEGORY_COLORS,
  categoryColorFor,
  dataColorToken,
} from '@/lib/dataColors';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { EmojiPickerField, FormField, Modal, ModalFooter, TextInput } from '@/components/ui';
import type { BudgetCategory, EditCategoryForm } from '../types';

type ColorSwatchesProps = { selected: string; onSelect: (color: string) => void };

// The six category colours; a saved legacy colour selects the swatch it displays as.
function ColorSwatches({ selected, onSelect }: Readonly<ColorSwatchesProps>) {
  const selectedSwatch = categoryColorFor(selected);
  return (
    <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Colour">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onSelect(color)}
          style={{ backgroundColor: dataColorToken(color) }}
          aria-label={CATEGORY_COLOR_NAMES[color]}
          aria-pressed={selectedSwatch === color}
          title={CATEGORY_COLOR_NAMES[color]}
          className={cn(
            'h-6 w-6 rounded-full transition-shadow duration-fast max-sm:h-11 max-sm:w-11',
            'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring',
            selectedSwatch === color && 'ring-2 ring-fg ring-offset-2 ring-offset-surface',
          )}
        />
      ))}
    </div>
  );
}

type EditCategoryDialogProps = {
  category: BudgetCategory;
  mode?: 'create' | 'edit';
  isSaving: boolean;
  onSave: (form: EditCategoryForm) => Promise<void>;
  onClose: () => void;
};

type CategoryFieldsProps = {
  currency: BudgetCategory['currency'];
  form: EditCategoryForm;
  set: <K extends keyof EditCategoryForm>(key: K, value: EditCategoryForm[K]) => void;
};

function toCategoryForm(category: BudgetCategory): EditCategoryForm {
  return {
    name: category.name,
    emoji: category.emoji,
    budgeted: String(category.budgeted),
    color: category.color,
  };
}

function getConfirmLabel(mode: 'create' | 'edit', isSaving: boolean) {
  if (isSaving) return 'Saving…';
  return mode === 'create' ? 'Add category' : 'Save';
}

function DialogError({ message }: Readonly<{ message: string | null }>) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-cell text-danger"
    >
      {message}
    </div>
  );
}

function CategoryFields({ form, set, currency }: Readonly<CategoryFieldsProps>) {
  return (
    <>
      <div className="flex gap-3">
        <EmojiPickerField label="Icon" value={form.emoji} onChange={(e) => set('emoji', e)} />
        <FormField label="Name" className="flex-1">
          <TextInput
            data-testid="budget-category-name-input"
            value={form.name}
            onChange={(value) => set('name', value)}
          />
        </FormField>
      </div>
      <FormField label={`Monthly budget (${currency})`}>
        <TextInput
          data-testid="budget-category-budget-input"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={form.budgeted}
          onChange={(value) => set('budgeted', value)}
        />
      </FormField>
      <FormField label="Colour">
        <ColorSwatches selected={form.color} onSelect={(c) => set('color', c)} />
      </FormField>
    </>
  );
}

export function EditCategoryDialog({
  category,
  mode = 'edit',
  isSaving,
  onSave,
  onClose,
}: Readonly<EditCategoryDialogProps>) {
  const [form, setForm] = useState<EditCategoryForm>(toCategoryForm(category));
  const [error, setError] = useState<string | null>(null);
  const resetKey = mode === 'create' ? 'create' : `edit-${category.id}`;
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    setForm(toCategoryForm(category));
    setError(null);
  }, [category, resetKey]);

  const set = <K extends keyof EditCategoryForm>(key: K, value: EditCategoryForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setError(null);
    try {
      await onSave(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save category');
    }
  };

  return (
    <Modal
      title={mode === 'create' ? 'Add category' : 'Edit category'}
      subtitle={`${category.month} ${category.year}`}
      onClose={onClose}
      maxWidth="sm"
      footer={
        <ModalFooter
          confirmLabel={getConfirmLabel(mode, isSaving)}
          disabled={isSaving}
          onConfirm={() => {
            void handleSave();
          }}
          onCancel={onClose}
        />
      }
    >
      <div className="space-y-4">
        <DialogError message={error} />
        <CategoryFields form={form} set={set} currency={category.currency} />
      </div>
    </Modal>
  );
}
