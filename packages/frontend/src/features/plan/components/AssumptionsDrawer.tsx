import { useEffect, useState } from 'react';
import type {
  PlanAssumptions,
  PlanAssumptionsInput,
  JurisdictionCode,
  WwWeeklyRequirementStatus,
} from '@quro/shared';
import { X } from 'lucide-react';
import { Button, FormField, SelectInput, TextInput } from '@/components/ui';
import { useUpdateAssumptions } from '../hooks';

type AssumptionForm = {
  leanBurnOverride: string;
  emergencyLifestylePct: string;
  benefitMonthlyOverride: string;
  benefitMaxMonthsOverride: string;
  wwWeeklyRequirement: WwWeeklyRequirementStatus;
  wwDurationMonths: string;
  wwDurationConfirmedAt: string;
  severanceMonthlySalaryOverride: string;
  excludedTiers: number[];
  countFullJointBalances: boolean;
};

const EMPTY_FORM: AssumptionForm = {
  leanBurnOverride: '',
  emergencyLifestylePct: '',
  benefitMonthlyOverride: '',
  benefitMaxMonthsOverride: '',
  wwWeeklyRequirement: 'unknown',
  wwDurationMonths: '',
  wwDurationConfirmedAt: '',
  severanceMonthlySalaryOverride: '',
  excludedTiers: [],
  countFullJointBalances: false,
};

function toForm(value: PlanAssumptions | null): AssumptionForm {
  if (!value) return EMPTY_FORM;
  return {
    leanBurnOverride: displayNumber(value.leanBurnOverride),
    emergencyLifestylePct: displayPercentage(value.emergencyLifestylePct),
    benefitMonthlyOverride: displayNumber(value.benefitMonthlyOverride),
    benefitMaxMonthsOverride: displayNumber(value.benefitMaxMonthsOverride),
    wwWeeklyRequirement: value.wwWeeklyRequirement ?? 'unknown',
    wwDurationMonths: displayNumber(value.wwDurationMonths),
    wwDurationConfirmedAt: value.wwDurationConfirmedAt ?? '',
    severanceMonthlySalaryOverride: displayNumber(value.severanceMonthlySalaryOverride),
    excludedTiers: value.excludedTiers ?? [],
    countFullJointBalances: Boolean(value.countFullJointBalances),
  };
}

function displayNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

function displayPercentage(value: number | null): string {
  return value === null ? '' : String(value * 100);
}

function nullableNumber(value: string): number | null {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function toInput(form: AssumptionForm): PlanAssumptionsInput {
  const lifestylePct = nullableNumber(form.emergencyLifestylePct);
  return {
    leanBurnOverride: nullableNumber(form.leanBurnOverride),
    emergencyLifestylePct: lifestylePct === null ? null : lifestylePct / 100,
    benefitMonthlyOverride: nullableNumber(form.benefitMonthlyOverride),
    benefitMaxMonthsOverride: nullableNumber(form.benefitMaxMonthsOverride),
    wwWeeklyRequirement: form.wwWeeklyRequirement,
    wwDurationMonths: nullableNumber(form.wwDurationMonths),
    wwDurationConfirmedAt: form.wwDurationConfirmedAt || null,
    severanceMonthlySalaryOverride: nullableNumber(form.severanceMonthlySalaryOverride),
    excludedTiers: form.excludedTiers.length > 0 ? form.excludedTiers : null,
    countFullJointBalances: form.countFullJointBalances,
  };
}

type AssumptionsDrawerProps = {
  open: boolean;
  assumptions: PlanAssumptions | null;
  jurisdiction: JurisdictionCode;
  onClose: () => void;
};

type SetAssumptionField = <K extends keyof AssumptionForm>(
  field: K,
  value: AssumptionForm[K],
) => void;

function LiquidityTierFields({
  excludedTiers,
  toggleTier,
}: Readonly<{ excludedTiers: readonly number[]; toggleTier: (tier: number) => void }>) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-fg-strong">Liquidity included</legend>
      <div className="mt-2 space-y-2">
        {[1, 2, 3].map((tier) => (
          <label
            key={tier}
            className="flex items-center gap-3 rounded-xl border border-border-default px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={!excludedTiers.includes(tier)}
              onChange={() => toggleTier(tier)}
            />
            Tier {tier}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The groups stay together to preserve the drawer's keyboard and reading order.
// eslint-disable-next-line max-lines-per-function
function AssumptionFields({
  form,
  jurisdiction,
  setField,
  toggleTier,
}: Readonly<{
  form: AssumptionForm;
  jurisdiction: JurisdictionCode;
  setField: SetAssumptionField;
  toggleTier: (tier: number) => void;
}>) {
  return (
    <div className="mt-6 space-y-5">
      <FormField label="Lean monthly burn override">
        <TextInput
          type="number"
          min={0}
          value={form.leanBurnOverride}
          onChange={(value) => setField('leanBurnOverride', value)}
        />
      </FormField>
      <FormField
        label="Emergency essential spending"
        hint="Percentage; contractual payments are unaffected"
      >
        <TextInput
          type="number"
          min={0}
          max={100}
          value={form.emergencyLifestylePct}
          onChange={(value) => setField('emergencyLifestylePct', value)}
        />
      </FormField>
      <LiquidityTierFields excludedTiers={form.excludedTiers} toggleTier={toggleTier} />
      <label className="flex items-start gap-3 rounded-xl border border-border-default p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.countFullJointBalances}
          onChange={(event) => setField('countFullJointBalances', event.target.checked)}
        />
        <span>
          <span className="font-medium text-fg-strong">Count full joint balances</span>
          <span className="mt-1 block text-xs leading-5 text-fg-subtle">
            The default model counts the user's 50% share.
          </span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {jurisdiction === 'NL' ? (
          <>
            <FormField
              label="UWV 26-of-36 weeks condition"
              hint="Employment at this employer alone does not determine WW eligibility"
            >
              <SelectInput
                value={form.wwWeeklyRequirement}
                onChange={(value) =>
                  setField('wwWeeklyRequirement', value as WwWeeklyRequirementStatus)
                }
                options={[
                  { value: 'unknown', label: 'Not confirmed' },
                  { value: 'met', label: 'Yes, I meet it' },
                  { value: 'not_met', label: 'No, I do not meet it' },
                ]}
              />
            </FormField>
            <FormField
              label="Confirmed WW duration (months)"
              hint="Use the duration shown by UWV; blank uses the statutory minimum"
            >
              <TextInput
                type="number"
                min={0}
                max={24}
                value={form.wwDurationMonths}
                onChange={(value) => setField('wwDurationMonths', value)}
              />
            </FormField>
            <FormField label="WW duration confirmed on">
              <TextInput
                type="date"
                value={form.wwDurationConfirmedAt}
                onChange={(value) => setField('wwDurationConfirmedAt', value)}
              />
            </FormField>
          </>
        ) : null}
        <FormField
          label={
            jurisdiction === 'AU'
              ? 'Redundancy monthly base-pay override'
              : 'Severance monthly salary override'
          }
          hint={
            jurisdiction === 'AU'
              ? 'Optional; use base pay for ordinary hours, excluding bonuses and separate allowances'
              : 'Optional; include fixed allowances used by the statutory calculation'
          }
        >
          <TextInput
            type="number"
            min={0}
            value={form.severanceMonthlySalaryOverride}
            onChange={(value) => setField('severanceMonthlySalaryOverride', value)}
          />
        </FormField>
        <FormField
          label={jurisdiction === 'AU' ? 'Monthly JobSeeker estimate' : 'Monthly benefit override'}
          hint={
            jurisdiction === 'AU'
              ? 'Use an estimate based on your Services Australia circumstances'
              : undefined
          }
        >
          <TextInput
            type="number"
            min={0}
            value={form.benefitMonthlyOverride}
            onChange={(value) => setField('benefitMonthlyOverride', value)}
          />
        </FormField>
        <FormField
          label={
            jurisdiction === 'AU'
              ? 'JobSeeker planning duration (months)'
              : 'Benefit duration (months)'
          }
        >
          <TextInput
            type="number"
            min={0}
            max={120}
            value={form.benefitMaxMonthsOverride}
            onChange={(value) => setField('benefitMaxMonthsOverride', value)}
          />
        </FormField>
      </div>
    </div>
  );
}

function AssumptionActions({
  pending,
  onReset,
  onApply,
}: Readonly<{
  pending: boolean;
  onReset: () => void;
  onApply: () => void;
}>) {
  return (
    <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-border-subtle pt-5">
      <Button variant="ghost" onClick={onReset} loading={pending}>
        Reset to derived
      </Button>
      <Button onClick={onApply} loading={pending}>
        Apply assumptions
      </Button>
    </div>
  );
}

// The drawer keeps form state and its accessible overlay lifecycle in one component.
// eslint-disable-next-line max-lines-per-function
export function AssumptionsDrawer({
  open,
  assumptions,
  jurisdiction,
  onClose,
}: Readonly<AssumptionsDrawerProps>) {
  const updateAssumptions = useUpdateAssumptions();
  const [form, setForm] = useState(() => toForm(assumptions));

  useEffect(() => setForm(toForm(assumptions)), [assumptions, open]);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  const setField = <K extends keyof AssumptionForm>(field: K, value: AssumptionForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }));
  const toggleTier = (tier: number) =>
    setField(
      'excludedTiers',
      form.excludedTiers.includes(tier)
        ? form.excludedTiers.filter((value) => value !== tier)
        : [...form.excludedTiers, tier],
    );
  const reset = () => {
    const cleared: PlanAssumptionsInput = {
      leanBurnOverride: null,
      emergencyLifestylePct: null,
      excludedTiers: null,
      countFullJointBalances: null,
      benefitMonthlyOverride: null,
      benefitMaxMonthsOverride: null,
      wwWeeklyRequirement: 'unknown',
      wwDurationMonths: null,
      wwDurationConfirmedAt: null,
      severanceMonthlySalaryOverride: null,
    };
    updateAssumptions.mutate(cleared, { onSuccess: () => setForm(EMPTY_FORM) });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-surface-inverse/25" role="presentation">
      <button
        className="absolute inset-0 cursor-default"
        aria-label="Close assumptions"
        onClick={onClose}
      />
      <aside
        className="relative h-full w-full max-w-lg overflow-y-auto bg-surface p-6 shadow-overlay"
        aria-label="Advanced runway assumptions"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
              Advanced planner
            </p>
            <h2 className="mt-2 text-xl font-semibold text-fg">Runway assumptions</h2>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        <p className="mt-3 text-sm leading-6 text-fg-muted">
          Blank values stay derived. Spending uses net cash flow; income tax and pension deductions
          are therefore not counted twice. Severance tax uses the effective payslip rate as a
          planning simplification.
        </p>
        <AssumptionFields
          form={form}
          jurisdiction={jurisdiction}
          setField={setField}
          toggleTier={toggleTier}
        />
        {updateAssumptions.isError ? (
          <p className="mt-4 text-sm text-danger-fg">Assumptions could not be saved.</p>
        ) : null}
        <AssumptionActions
          pending={updateAssumptions.isPending}
          onReset={reset}
          onApply={() => updateAssumptions.mutate(toInput(form), { onSuccess: onClose })}
        />
      </aside>
    </div>
  );
}
