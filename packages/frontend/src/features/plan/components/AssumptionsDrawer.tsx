import { useEffect, useState } from 'react';
import type { PlanAssumptions, PlanAssumptionsInput } from '@quro/shared';
import { X } from 'lucide-react';
import { Button, FormField, TextInput } from '@/components/ui';
import { useUpdateAssumptions } from '../hooks';

type AssumptionForm = {
  leanBurnOverride: string;
  emergencyLifestylePct: string;
  benefitMonthlyOverride: string;
  benefitMaxMonthsOverride: string;
  excludedTiers: number[];
  countFullJointBalances: boolean;
};

const EMPTY_FORM: AssumptionForm = {
  leanBurnOverride: '',
  emergencyLifestylePct: '',
  benefitMonthlyOverride: '',
  benefitMaxMonthsOverride: '',
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
    excludedTiers: form.excludedTiers.length > 0 ? form.excludedTiers : null,
    countFullJointBalances: form.countFullJointBalances,
  };
}

type AssumptionsDrawerProps = {
  open: boolean;
  assumptions: PlanAssumptions | null;
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
      <legend className="text-sm font-medium text-slate-700">Liquidity included</legend>
      <div className="mt-2 space-y-2">
        {[1, 2, 3].map((tier) => (
          <label
            key={tier}
            className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm"
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

function AssumptionFields({
  form,
  setField,
  toggleTier,
}: Readonly<{
  form: AssumptionForm;
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
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.countFullJointBalances}
          onChange={(event) => setField('countFullJointBalances', event.target.checked)}
        />
        <span>
          <span className="font-medium text-slate-800">Count full joint balances</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            The default model counts the user's 50% share.
          </span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Monthly benefit override">
          <TextInput
            type="number"
            min={0}
            value={form.benefitMonthlyOverride}
            onChange={(value) => setField('benefitMonthlyOverride', value)}
          />
        </FormField>
        <FormField label="Benefit duration (months)">
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
    <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-5">
      <Button variant="ghost" onClick={onReset} loading={pending}>
        Reset to derived
      </Button>
      <Button onClick={onApply} loading={pending}>
        Apply assumptions
      </Button>
    </div>
  );
}

export function AssumptionsDrawer({
  open,
  assumptions,
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
    };
    updateAssumptions.mutate(cleared, { onSuccess: () => setForm(EMPTY_FORM) });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/25" role="presentation">
      <button
        className="absolute inset-0 cursor-default"
        aria-label="Close assumptions"
        onClick={onClose}
      />
      <aside
        className="relative h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"
        aria-label="Advanced runway assumptions"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Advanced planner
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Runway assumptions</h2>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Blank values stay derived. Spending uses net cash flow; income tax and pension deductions
          are therefore not counted twice. Severance tax uses the effective payslip rate as a
          planning simplification.
        </p>
        <AssumptionFields form={form} setField={setField} toggleTier={toggleTier} />
        {updateAssumptions.isError ? (
          <p className="mt-4 text-sm text-rose-600">Assumptions could not be saved.</p>
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
