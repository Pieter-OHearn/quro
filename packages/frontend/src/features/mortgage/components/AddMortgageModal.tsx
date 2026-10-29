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
  TEXT_FIELD_LIMITS,
} from '@quro/shared';
import { JointToggleField } from '@/features/partner';
import { useAddMortgageForm } from '../hooks';
import type { DeleteMortgageMode } from '../hooks/mutations';
import type { MortgageFormPayload, MortgageFormState } from '../types';

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

const SECTION_HEADING = 'mb-2 text-cell font-semibold text-fg';
const FIELD_HINT = 'mt-1 text-caption text-fg-subtle';
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
          maxLength={TEXT_FIELD_LIMITS.mortgage.lender}
          onChange={(value) => setField('lender', value)}
        />
      </FormField>
      <FormField label="Currency">
        <TextInput disabled readOnly value={form.currency} onChange={() => undefined} />
      </FormField>
    </div>
  );
}

function PropertySection({ form, errors, setField }: PropertySectionProps) {
  return (
    <div>
      <h3 className={SECTION_HEADING}>Property</h3>
      <div className="space-y-3">
        <FormField label="Property address">
          <TextInput
            disabled
            readOnly
            placeholder="Select a property below"
            value={form.propertyAddress}
            onChange={() => undefined}
          />
          <p className={FIELD_HINT}>Taken from the linked property.</p>
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
      <h3 className={SECTION_HEADING}>Property link</h3>
      <FormField label="Linked property" error={errors.linkedPropertyId}>
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
      <p className={FIELD_HINT}>Add a property first, then link the mortgage here.</p>
      {selectedProperty && (
        <p className={FIELD_HINT}>
          Using linked property details: {selectedProperty.address} ({selectedProperty.currency}).
        </p>
      )}
      {availableProperties.length === 0 && !existing && (
        <p className="mt-2 text-caption text-warning">
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
    { field: 'originalAmount', label: 'Original loan amount', placeholder: '240000' },
    { field: 'outstandingBalance', label: 'Outstanding balance', placeholder: '218600' },
    {
      field: 'propertyValue',
      label: 'Current property value',
      placeholder: 'From linked property',
      readOnly: true,
    },
    { field: 'monthlyPayment', label: 'Monthly payment', placeholder: '1280' },
  ];
  return (
    <div>
      <h3 className={SECTION_HEADING}>Loan financials</h3>
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
              className="pr-3"
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
    <FormField label="Interest rate (%)" required error={errors.interestRate}>
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
    <FormField label="Loan term" required error={errors.termYears}>
      <div className="relative">
        <TextInput
          type="number"
          className="pr-14"
          error={Boolean(errors.termYears)}
          placeholder="25"
          value={form.termYears}
          onChange={(value) => setField('termYears', value)}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-subtle">
          years
        </span>
      </div>
    </FormField>
  );
}

function OverpaymentLimitField({ form, setField }: { form: FormState; setField: SetFieldFn }) {
  return (
    <FormField label="Overpayment limit (%)">
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
      <h3 className={SECTION_HEADING}>Rate & term</h3>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Repayment method">
          <SelectInput
            value={form.repaymentType}
            onChange={(value) => setField('repaymentType', toMortgageRepaymentType(value))}
            options={REPAYMENT_TYPES}
          />
          <p className={FIELD_HINT}>
            {form.repaymentType === 'Linear'
              ? 'Fixed principal; the monthly payment declines over time.'
              : 'Fixed payment; the principal share increases over time.'}
          </p>
        </FormField>
        <InterestRateField form={form} errors={errors} setField={setField} />
        <FormField label="Rate type">
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
      <h3 className={SECTION_HEADING}>Dates</h3>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Start date">
          <TextInput
            placeholder="e.g. March 2022"
            value={form.startDate}
            onChange={(value) => setField('startDate', value)}
          />
        </FormField>
        <FormField label="End date">
          <TextInput
            placeholder="e.g. March 2047"
            value={form.endDate}
            onChange={(value) => setField('endDate', value)}
          />
        </FormField>
        <FormField label="Fixed until">
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
    return { border: 'border-success bg-success-soft', text: 'text-success' };
  if (ltv < MEDIUM_LTV_THRESHOLD)
    return { border: 'border-warning bg-warning-soft', text: 'text-warning' };
  return { border: 'border-danger bg-danger-soft', text: 'text-danger' };
}

type LtvPreviewProps = { ltvPreview: string; form: FormState };

function LtvPreview({ ltvPreview, form }: LtvPreviewProps) {
  const { numberFormat } = useCurrency();
  const ltvVal = parseFloat(ltvPreview);
  const { border, text } = getLtvColor(ltvVal);
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${border}`}>
      <div>
        <p className="text-label text-fg">Loan-to-value preview</p>
        <p className="mt-0.5 text-caption text-fg-muted font-numeric">
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
        <p className={`text-figure-lg font-numeric ${text}`}>{ltvPreview}%</p>
        <p className="text-caption text-fg-muted">LTV</p>
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
    <div className="space-y-4 overflow-y-auto p-4">
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
      className="border border-danger text-danger"
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
      entityName={existing.propertyAddress ?? existing.lender}
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
      title={existing ? 'Edit mortgage' : 'Add mortgage'}
      subtitle={existing ? 'Update mortgage details' : 'Set up a new property mortgage'}
      onClose={onClose}
      maxWidth="xl"
      scrollable
      bodyClassName="p-0 space-y-0"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => {
            void handleSave();
          }}
          confirmLabel={existing ? 'Save changes' : 'Add mortgage'}
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
