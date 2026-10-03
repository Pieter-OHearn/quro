import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  ArchiveOrDeleteDialog,
  Modal,
  ModalFooter,
  FormField,
  TextInput,
  IconButton,
} from '@/components/ui';
import { JointToggleField } from '@/features/partner';
import { formatFixedInputValue } from '@/lib/utils';
import { formatPercent, type Property } from '@quro/shared';
import type { DeletePropertyMode } from '../hooks/mutations';

type UpdatePropertyModalProps = {
  property: Property;
  mortgageBalance: number;
  onClose: () => void;
  onSave: (id: number, value: number, rent: number, isJoint: boolean) => void;
  onDelete?: (id: number, mode?: DeletePropertyMode) => void;
};

type PropertyStatsPreviewProps = {
  equity: number;
  appreciation: number;
  appreciationPct: number;
  currency: string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function PropertyStatsPreview({
  equity,
  appreciation,
  appreciationPct,
  currency,
  fmtNative,
}: PropertyStatsPreviewProps) {
  return (
    <div className="bg-surface-sunken rounded-xl p-3 space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-fg-subtle">Equity</span>
        <span className={`font-semibold ${equity >= 0 ? 'text-success' : 'text-danger'}`}>
          {fmtNative(equity, currency)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-subtle">Appreciation</span>
        <span className={`font-semibold ${appreciation >= 0 ? 'text-success' : 'text-danger'}`}>
          {appreciation >= 0 ? '+' : ''}
          {fmtNative(appreciation, currency)} ({appreciationPct >= 0 ? '+' : ''}
          {formatPercent(appreciationPct, 1)})
        </span>
      </div>
    </div>
  );
}

function useUpdatePropertyForm(property: Property) {
  const [value, setValue] = useState(formatFixedInputValue(property.currentValue));
  const [rent, setRent] = useState(formatFixedInputValue(property.monthlyRent));
  const [isJoint, setIsJoint] = useState(property.isJoint);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const numericValue = parseFloat(value) || 0;
  const equity = numericValue; // mortgage balance is passed in separately
  const appreciation = numericValue - property.purchasePrice;
  const appreciationPct =
    ((numericValue || property.currentValue) / property.purchasePrice - 1) * 100;

  function handleValueChange(next: string) {
    setValue(next);
    setErrors((previous) => ({ ...previous, value: '' }));
  }

  return {
    value,
    rent,
    isJoint,
    errors,
    numericValue,
    equity,
    appreciation,
    appreciationPct,
    setRent,
    setIsJoint,
    setErrors,
    handleValueChange,
  };
}

type MortgageBalanceFieldProps = {
  mortgageBalance: number;
  currency: string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function MortgageBalanceField({ mortgageBalance, currency, fmtNative }: MortgageBalanceFieldProps) {
  return (
    <FormField label="Linked Mortgage Balance">
      <div className="w-full rounded-xl border border-border-default bg-surface-sunken px-3 py-2.5 text-sm text-fg-strong">
        {mortgageBalance > 0 ? fmtNative(mortgageBalance, currency) : 'No mortgage linked yet'}
      </div>
      <p className="text-xs text-fg-faint mt-1">
        Manage property-mortgage links in the Mortgage section.
      </p>
    </FormField>
  );
}

function buildUpdateSaveHandler(
  form: ReturnType<typeof useUpdatePropertyForm>,
  property: Property,
  onSave: (id: number, value: number, rent: number, isJoint: boolean) => void,
  onClose: () => void,
) {
  return () => {
    if (!form.value || isNaN(parseFloat(form.value))) {
      form.setErrors({ value: 'Required' });
      return;
    }
    onSave(property.id, form.numericValue, parseFloat(form.rent) || 0, form.isJoint);
    onClose();
  };
}

function buildDeleteButton(
  onDelete: UpdatePropertyModalProps['onDelete'],
  onRequestConfirm: () => void,
): React.ReactNode {
  if (!onDelete) return undefined;
  return (
    <IconButton
      icon={Trash2}
      label="Remove property"
      variant="danger"
      size="lg"
      className="border border-danger-border text-danger"
      onClick={onRequestConfirm}
    />
  );
}

function PropertyDeleteDialog({
  property,
  onDelete,
  onCancel,
}: Readonly<{
  property: Property;
  onDelete: NonNullable<UpdatePropertyModalProps['onDelete']>;
  onCancel: () => void;
}>) {
  return (
    <ArchiveOrDeleteDialog
      entityLabel="Property"
      entityName={property.address}
      balance={property.currentValue}
      balanceCurrency={property.currency}
      balanceLabel="current value"
      childrenLabel="transaction history"
      onArchive={() => onDelete(property.id, 'preserveTransactions')}
      onDelete={() => onDelete(property.id, 'deleteTransactions')}
      onCancel={onCancel}
    />
  );
}

export function UpdatePropertyModal({
  property,
  mortgageBalance,
  onClose,
  onSave,
  onDelete,
}: UpdatePropertyModalProps) {
  const { fmtNative } = useCurrency();
  const form = useUpdatePropertyForm(property);
  const equity = form.numericValue - mortgageBalance;
  const handleSave = buildUpdateSaveHandler(form, property, onSave, onClose);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (confirmingDelete && onDelete) {
    return (
      <PropertyDeleteDialog
        property={property}
        onDelete={onDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    );
  }

  return (
    <Modal
      title="Update Property"
      subtitle={property.address}
      onClose={onClose}
      maxWidth="sm"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel="Update"
          danger={buildDeleteButton(onDelete, () => setConfirmingDelete(true))}
        />
      }
    >
      <FormField label={`Current Value (${property.currency})`} required error={form.errors.value}>
        <TextInput
          type="number"
          inputMode="decimal"
          step="0.01"
          value={form.value}
          onChange={form.handleValueChange}
          error={Boolean(form.errors.value)}
        />
        <p className="text-xs text-fg-faint mt-1">
          Previously {fmtNative(property.currentValue, property.currency)}
        </p>
      </FormField>
      <MortgageBalanceField
        mortgageBalance={mortgageBalance}
        currency={property.currency}
        fmtNative={fmtNative}
      />
      <FormField label={`Monthly Rent (${property.currency})`}>
        <TextInput
          type="number"
          inputMode="decimal"
          step="0.01"
          value={form.rent}
          onChange={form.setRent}
        />
      </FormField>
      <JointToggleField
        checked={form.isJoint}
        onChange={form.setIsJoint}
        hint="Also applies to a linked mortgage. Counts 50/50 in both dashboards."
      />
      <PropertyStatsPreview
        equity={equity}
        appreciation={form.appreciation}
        appreciationPct={form.appreciationPct}
        currency={property.currency}
        fmtNative={fmtNative}
      />
    </Modal>
  );
}
