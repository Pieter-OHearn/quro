import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  ArchiveOrDeleteDialog,
  Change,
  Modal,
  ModalFooter,
  FormField,
  TextInput,
  IconButton,
} from '@/components/ui';
import { JointToggleField } from '@/features/partner';
import { formatFixedInputValue } from '@/lib/utils';
import type { Property } from '@quro/shared';
import { PreviewPanel, PreviewRow } from '@/components/finance/PreviewPanel';
import type { DeletePropertyMode } from '../hooks/mutations';

type UpdatePropertyModalProps = {
  property: Property;
  /** Whether a valuation sets the value: it is then changed by recording another valuation. */
  hasValuation: boolean;
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
    <PreviewPanel>
      <PreviewRow label="Equity">{fmtNative(equity, currency)}</PreviewRow>
      <PreviewRow label="Appreciation">
        <span className="inline-flex flex-wrap justify-end gap-x-1.5">
          <Change value={appreciation} format="amount" currency={currency} />
          <Change value={appreciationPct} format="percent" />
        </span>
      </PreviewRow>
    </PreviewPanel>
  );
}

function useUpdatePropertyForm(property: Property) {
  const [value, setValue] = useState(formatFixedInputValue(property.currentValue));
  const [rent, setRent] = useState(formatFixedInputValue(property.monthlyRent));
  const [isJoint, setIsJoint] = useState(property.isJoint);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const numericValue = parseFloat(value) || 0;
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
    <FormField label="Linked mortgage balance">
      <p className="font-numeric text-cell text-fg">
        {mortgageBalance > 0 ? fmtNative(mortgageBalance, currency) : 'No mortgage linked yet'}
      </p>
      <p className="mt-1 text-caption text-fg-subtle">
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

type CurrentValueFieldProps = {
  property: Property;
  hasValuation: boolean;
  form: ReturnType<typeof useUpdatePropertyForm>;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

// Once a valuation sets the value, the field shows it and the property's ledger changes it.
function CurrentValueField({ property, hasValuation, form, fmtNative }: CurrentValueFieldProps) {
  const label = `Current value (${property.currency})`;
  if (hasValuation) {
    return (
      <FormField label={label}>
        <p className="font-numeric text-cell text-fg">
          {fmtNative(property.currentValue, property.currency)}
        </p>
        <p className="mt-1 text-caption text-fg-subtle">
          Set by the latest valuation. Record a valuation to change it.
        </p>
      </FormField>
    );
  }
  return (
    <FormField label={label} required error={form.errors.value}>
      <TextInput
        type="number"
        inputMode="decimal"
        step="0.01"
        value={form.value}
        onChange={form.handleValueChange}
        error={Boolean(form.errors.value)}
      />
      <p className="mt-1 text-caption text-fg-subtle">
        Previously {fmtNative(property.currentValue, property.currency)}
      </p>
    </FormField>
  );
}

export function UpdatePropertyModal({
  property,
  hasValuation,
  onClose,
  onSave,
  onDelete,
}: UpdatePropertyModalProps) {
  const { fmtNative } = useCurrency();
  const form = useUpdatePropertyForm(property);
  // The debt is the linked mortgage's, read on the server.
  const mortgageBalance = property.debt;
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
      title="Update property"
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
      <CurrentValueField
        property={property}
        hasValuation={hasValuation}
        form={form}
        fmtNative={fmtNative}
      />
      <MortgageBalanceField
        mortgageBalance={mortgageBalance}
        currency={property.currency}
        fmtNative={fmtNative}
      />
      <FormField label={`Monthly rent (${property.currency})`}>
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
