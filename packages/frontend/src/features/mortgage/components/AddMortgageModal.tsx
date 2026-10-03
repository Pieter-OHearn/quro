import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  ArchiveOrDeleteDialog,
  Modal,
  ModalFooter,
  CurrencyInput,
  TextInput,
  FormField,
  SelectInput,
  IconButton,
} from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  formatNumber,
  MORTGAGE_RATE_TYPES,
  MORTGAGE_REPAYMENT_TYPES,
  type Mortgage as MortgageType,
  type MortgageRateType,
  type MortgageRepaymentType,
  type Property,
} from '@quro/shared';
import { JointToggleField } from '@/features/partner';
import { useAddMortgageForm } from '../hooks';
import type { DeleteMortgageMode } from '../hooks/mutations';
import type { MortgageFormPayload, MortgageFormState } from '../types';

export type { MortgageFormPayload } from '../types';

type AddMortgageModalProps = {
  existing?: MortgageType;
  properties: Property[];
  linkedPropertyId: number | null;
  onClose: () => void;
  onSave: (mortgage: MortgageFormPayload) => Promise<void> | void;
  onDelete?: (id: number, mode?: DeleteMortgageMode) => void;
};

export const RATE_TYPES = [...MORTGAGE_RATE_TYPES];
export const REPAYMENT_TYPES = [...MORTGAGE_REPAYMENT_TYPES];
const LOW_LTV_THRESHOLD = 70;
const MEDIUM_LTV_THRESHOLD = 85;

function toMortgageRateType(value: string): MortgageRateType {
  return MORTGAGE_RATE_TYPES.includes(value as MortgageRateType)
    ? (value as MortgageRateType)
    : 'Fixed';
}

function toMortgageRepaymentType(value: string): MortgageRepaymentType {
  return MORTGAGE_REPAYMENT_TYPES.includes(value as MortgageRepaymentType)
    ? (value as MortgageRepaymentType)
    : 'Annuity';
}

const n = (value: string) => parseFloat(value) || 0;

// ─── Form Section Sub-components ─────────────────────────────────────────────

type FormState = MortgageFormState;
type SetFieldFn = <K extends keyof FormState>(field: K, value: FormState[K]) => void;
type Errors = Record<string, string>;

type PropertySectionProps = { form: FormState; errors: Errors; setField: SetFieldFn };

function LenderCurrencyGrid({ form, errors, setField }: PropertySectionProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <FormField label="Lender" required error={errors.lender} className="col-span-2">
        <TextInput
          error={Boolean(errors.lender)}
          placeholder="e.g. ABN AMRO"
          value={form.lender}
          onChange={(value) => setField('lender', value)}
        />
      </FormField>
      <FormField label="Currency">
        <TextInput
          disabled
          readOnly
          className="bg-surface-muted text-fg-subtle"
          value={form.currency}
          onChange={() => undefined}
        />
      </FormField>
    </div>
  );
}

function PropertySection({ form, errors, setField }: PropertySectionProps) {
  return (
    <div>
      <p className="text-[10px] font-bold text-fg-faint uppercase tracking-widest mb-3">Property</p>
      <div className="space-y-3">
        <FormField label="Property Address">
          <TextInput
            disabled
            readOnly
            className="bg-surface-muted text-fg-subtle"
            placeholder="Select a property below"
            value={form.propertyAddress}
            onChange={() => undefined}
          />
          <p className="text-[10px] text-fg-faint mt-1">Taken from the linked property.</p>
        </FormField>
        <LenderCurrencyGrid form={form} errors={errors} setField={setField} />
      </div>
    </div>
  );
}

type PropertyLinkSectionProps = {
  form: FormState;
  errors: Errors;
  setField: SetFieldFn;
  availableProperties: Property[];
  selectedProperty: Property | undefined;
  existing?: MortgageType;
};

function PropertyLinkSection({
  form,
  errors,
  setField,
  availableProperties,
  selectedProperty,
  existing,
}: PropertyLinkSectionProps) {
  return (
    <div>
      <p className="text-[10px] font-bold text-fg-faint uppercase tracking-widest mb-3">
        Property Link
      </p>
      <FormField label="Linked Property" error={errors.linkedPropertyId}>
        <SelectInput
          error={Boolean(errors.linkedPropertyId)}
          value={form.linkedPropertyId}
          onChange={(value) => setField('linkedPropertyId', value)}
          options={[
            { value: '', label: 'Select a property' },
            ...availableProperties.map((property) => ({
              value: property.id.toString(),
              label: `${property.emoji} ${property.address} (${property.currency})`,
            })),
          ]}
        />
      </FormField>
      <p className="text-[10px] text-fg-faint mt-1.5">
        Add a property first, then link the mortgage here.
      </p>
      {selectedProperty && (
        <p className="text-[10px] text-brand mt-1">
          Using linked property details: {selectedProperty.address} ({selectedProperty.currency}).
        </p>
      )}
      {availableProperties.length === 0 && !existing && (
        <p className="text-xs text-warning mt-2">
          No unlinked properties available. Add a property in Investments first.
        </p>
      )}
    </div>
  );
}

type LoanFinancialsSectionProps = { form: FormState; errors: Errors; setField: SetFieldFn };

type LoanFinancialField =
  'originalAmount' | 'outstandingBalance' | 'propertyValue' | 'monthlyPayment';

function LoanFinancialsSection({ form, errors, setField }: LoanFinancialsSectionProps) {
  // Property value is derived from the linked property, so it is shown
  // read-only here — editing it would be discarded on save.
  const fields: Array<{
    field: LoanFinancialField;
    label: string;
    placeholder: string;
    readOnly?: boolean;
  }> = [
    { field: 'originalAmount', label: 'Original Loan Amount', placeholder: '240000' },
    { field: 'outstandingBalance', label: 'Outstanding Balance', placeholder: '218600' },
    {
      field: 'propertyValue',
      label: 'Current Property Value',
      placeholder: 'From linked property',
      readOnly: true,
    },
    { field: 'monthlyPayment', label: 'Monthly Payment', placeholder: '1280' },
  ];
  return (
    <div>
      <p className="text-[10px] font-bold text-fg-faint uppercase tracking-widest mb-3">
        Loan Financials
      </p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ field, label, placeholder, readOnly }) => (
          <FormField
            key={field}
            label={label}
            required={!readOnly}
            error={!readOnly && errors[field]}
          >
            <CurrencyInput
              currency={form.currency}
              disabled={readOnly}
              readOnly={readOnly}
              error={!readOnly && Boolean(errors[field])}
              className={readOnly ? 'bg-surface-muted text-fg-subtle pr-3' : 'pr-3'}
              placeholder={placeholder}
              value={form[field]}
              onChange={(value) => setField(field, value)}
            />
          </FormField>
        ))}
      </div>
    </div>
  );
}

type RateTermSectionProps = { form: FormState; errors: Errors; setField: SetFieldFn };

function InterestRateField({ form, errors, setField }: RateTermSectionProps) {
  return (
    <FormField label="Interest Rate (%)" required error={errors.interestRate}>
      <CurrencyInput
        currency="%"
        className="pl-8 pr-3"
        step="0.01"
        placeholder="4.25"
        value={form.interestRate}
        error={Boolean(errors.interestRate)}
        onChange={(value) => setField('interestRate', value)}
      />
    </FormField>
  );
}

function LoanTermField({ form, errors, setField }: RateTermSectionProps) {
  return (
    <FormField label="Loan Term" required error={errors.termYears}>
      <div className="relative">
        <TextInput
          type="number"
          className="pr-14"
          error={Boolean(errors.termYears)}
          placeholder="25"
          value={form.termYears}
          onChange={(value) => setField('termYears', value)}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-faint">
          years
        </span>
      </div>
    </FormField>
  );
}

function OverpaymentLimitField({ form, setField }: { form: FormState; setField: SetFieldFn }) {
  return (
    <FormField label="Overpayment Limit (%)">
      <CurrencyInput
        currency="%"
        className="pl-8 pr-3"
        step="1"
        placeholder="10"
        value={form.overpaymentLimit}
        onChange={(value) => setField('overpaymentLimit', value)}
      />
    </FormField>
  );
}

function RateTermSection({ form, errors, setField }: RateTermSectionProps) {
  return (
    <div>
      <p className="text-[10px] font-bold text-fg-faint uppercase tracking-widest mb-3">
        Rate & Term
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Repayment Method">
          <SelectInput
            value={form.repaymentType}
            onChange={(value) => setField('repaymentType', toMortgageRepaymentType(value))}
            options={REPAYMENT_TYPES}
          />
          <p className="text-[10px] text-fg-faint mt-1">
            {form.repaymentType === 'Linear'
              ? 'Fixed principal; the monthly payment declines over time.'
              : 'Fixed payment; the principal share increases over time.'}
          </p>
        </FormField>
        <InterestRateField form={form} errors={errors} setField={setField} />
        <FormField label="Rate Type">
          <SelectInput
            value={form.rateType}
            onChange={(value) => setField('rateType', toMortgageRateType(value))}
            options={RATE_TYPES}
          />
        </FormField>
        <LoanTermField form={form} errors={errors} setField={setField} />
        <OverpaymentLimitField form={form} setField={setField} />
      </div>
    </div>
  );
}

type DatesSectionProps = { form: FormState; setField: SetFieldFn };

function DatesSection({ form, setField }: DatesSectionProps) {
  return (
    <div>
      <p className="text-[10px] font-bold text-fg-faint uppercase tracking-widest mb-3">Dates</p>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Start Date">
          <TextInput
            placeholder="e.g. March 2022"
            value={form.startDate}
            onChange={(value) => setField('startDate', value)}
          />
        </FormField>
        <FormField label="End Date">
          <TextInput
            placeholder="e.g. March 2047"
            value={form.endDate}
            onChange={(value) => setField('endDate', value)}
          />
        </FormField>
        <FormField label="Fixed Until">
          <TextInput
            placeholder={form.rateType === 'Fixed' ? 'e.g. March 2027' : 'N/A'}
            disabled={form.rateType !== 'Fixed'}
            value={form.rateType === 'Fixed' ? form.fixedUntil : ''}
            onChange={(value) => setField('fixedUntil', value)}
          />
        </FormField>
      </div>
    </div>
  );
}

function getLtvColor(ltv: number) {
  if (ltv < LOW_LTV_THRESHOLD)
    return { border: 'bg-success-soft border-success-soft-strong', text: 'text-success' };
  if (ltv < MEDIUM_LTV_THRESHOLD)
    return { border: 'bg-warning-soft border-warning-soft-strong', text: 'text-warning' };
  return { border: 'bg-danger-soft border-danger-soft-strong', text: 'text-danger' };
}

type LtvPreviewProps = { ltvPreview: string; form: FormState };

function LtvPreview({ ltvPreview, form }: LtvPreviewProps) {
  const { numberFormat } = useCurrency();
  const ltvVal = parseFloat(ltvPreview);
  const { border, text } = getLtvColor(ltvVal);
  return (
    <div className={`rounded-xl p-4 border flex items-center justify-between ${border}`}>
      <div>
        <p className="text-xs font-semibold text-fg-strong">Loan-to-Value Preview</p>
        <p className="text-xs text-fg-subtle mt-0.5">
          {form.currency}{' '}
          {formatNumber(n(form.outstandingBalance), numberFormat, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{' '}
          on {form.currency}{' '}
          {formatNumber(n(form.propertyValue), numberFormat, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-black text-xl ${text}`}>{ltvPreview}%</p>
        <p className="text-[10px] text-fg-faint">LTV</p>
      </div>
    </div>
  );
}

type MortgageFormBodyProps = {
  form: MortgageFormState;
  errors: Record<string, string>;
  setField: SetFieldFn;
  availableProperties: Property[];
  selectedProperty: Property | undefined;
  existing: MortgageType | undefined;
  ltvPreview: string | null;
};

function MortgageFormBody({
  form,
  errors,
  setField,
  availableProperties,
  selectedProperty,
  existing,
  ltvPreview,
}: MortgageFormBodyProps) {
  return (
    <div className="p-6 space-y-5 overflow-y-auto">
      <PropertySection form={form} errors={errors} setField={setField} />
      <PropertyLinkSection
        form={form}
        errors={errors}
        setField={setField}
        availableProperties={availableProperties}
        selectedProperty={selectedProperty}
        existing={existing}
      />
      <LoanFinancialsSection form={form} errors={errors} setField={setField} />
      <RateTermSection form={form} errors={errors} setField={setField} />
      <DatesSection form={form} setField={setField} />
      <JointToggleField
        checked={form.isJoint}
        onChange={(checked) => setField('isJoint', checked)}
        hint="Also applies to the linked property. Counts 50/50 in both dashboards."
      />
      {ltvPreview && <LtvPreview ltvPreview={ltvPreview} form={form} />}
    </div>
  );
}

function buildMortgageDeleteButton(
  existing: MortgageType | undefined,
  onDelete: AddMortgageModalProps['onDelete'],
  onRequestConfirm: () => void,
): React.ReactNode {
  if (!existing || !onDelete) return undefined;
  return (
    <IconButton
      icon={Trash2}
      label="Remove mortgage"
      variant="danger"
      size="lg"
      className="border border-danger-border text-danger"
      onClick={onRequestConfirm}
    />
  );
}

function MortgageDeleteDialog({
  existing,
  onDelete,
  onCancel,
}: Readonly<{
  existing: MortgageType;
  onDelete: NonNullable<AddMortgageModalProps['onDelete']>;
  onCancel: () => void;
}>) {
  return (
    <ArchiveOrDeleteDialog
      entityLabel="Mortgage"
      entityName={existing.propertyAddress}
      balance={existing.outstandingBalance}
      balanceCurrency={existing.currency}
      balanceLabel="outstanding balance"
      childrenLabel="repayment history"
      onArchive={() => onDelete(existing.id, 'preserveTransactions')}
      onDelete={() => onDelete(existing.id, 'deleteTransactions')}
      onCancel={onCancel}
    />
  );
}

function deriveMortgageModalState(
  form: MortgageFormState,
  properties: Property[],
  linkedPropertyId: number | null,
  existing: MortgageType | undefined,
  saving: boolean,
) {
  const linkedPropertyIdNum = form.linkedPropertyId
    ? Number.parseInt(form.linkedPropertyId, 10)
    : NaN;
  const selectedProperty = Number.isInteger(linkedPropertyIdNum)
    ? properties.find((p) => p.id === linkedPropertyIdNum)
    : undefined;
  const availableProperties = properties.filter(
    (p) => p.mortgageId == null || p.id === linkedPropertyId,
  );
  const ltvPreview =
    n(form.propertyValue) > 0
      ? ((n(form.outstandingBalance) / n(form.propertyValue)) * 100).toFixed(1)
      : null;
  const disableSave = saving || (!existing && availableProperties.length === 0);
  return { selectedProperty, availableProperties, ltvPreview, disableSave };
}

export function AddMortgageModal(props: AddMortgageModalProps) {
  const { existing, properties, linkedPropertyId, onClose, onSave, onDelete } = props;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { form, errors, saving, setField, handleSave } = useAddMortgageForm({
    existing,
    properties,
    linkedPropertyId,
    onClose,
    onSave,
  });
  const { selectedProperty, availableProperties, ltvPreview, disableSave } =
    deriveMortgageModalState(form, properties, linkedPropertyId, existing, saving);

  if (confirmingDelete && existing && onDelete) {
    return (
      <MortgageDeleteDialog
        existing={existing}
        onDelete={onDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    );
  }

  return (
    <Modal
      title={existing ? 'Edit Mortgage' : 'Add Mortgage'}
      subtitle={existing ? 'Update mortgage details' : 'Set up a new property mortgage'}
      onClose={onClose}
      maxWidth="xl"
      scrollable
      backdropClassName="bg-overlay/50 backdrop-blur-sm"
      bodyClassName="p-0 space-y-0"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => {
            void handleSave();
          }}
          confirmLabel={existing ? 'Save Changes' : 'Add Mortgage'}
          disabled={disableSave}
          loading={saving}
          danger={buildMortgageDeleteButton(existing, onDelete, () => setConfirmingDelete(true))}
        />
      }
    >
      <MortgageFormBody
        form={form}
        errors={errors}
        setField={setField}
        availableProperties={availableProperties}
        selectedProperty={selectedProperty}
        existing={existing}
        ltvPreview={ltvPreview}
      />
    </Modal>
  );
}
