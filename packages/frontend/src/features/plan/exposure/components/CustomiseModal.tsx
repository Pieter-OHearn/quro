import { useState } from 'react';
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  CONCENTRATION_THRESHOLD_KEYS,
  EXPOSURE_DEFAULTS_VERSION,
  MAX_RISK_CLASS,
  MIN_RISK_CLASS,
  MIX_GROUPS,
  MIX_GROUP_LABELS,
  REFERENCE_MIX_IDS,
  THRESHOLD_LABELS,
  defaultRiskRange,
  parseExposureSettings,
  referenceMixName,
  riskBandLabel,
  type AssetClass,
  type ConcentrationThresholdKey,
  type ExposureSettings,
  type MixGroup,
  type ReferenceMixId,
} from '@quro/shared';
import { Button, FormField, Modal, ModalFooter, SelectInput, TextInput } from '@/components/ui';
import { resolveApiErrorMessage } from '@/lib/api';
import { useResetExposureSettings, useSaveExposureSettings } from '../hooks';
import { toForm, toSettings, type Form } from '../customiseForm';

const RISK_OPTIONS = [
  { value: '', label: 'No default' },
  ...Array.from({ length: MAX_RISK_CLASS - MIN_RISK_CLASS + 1 }, (_, index) => {
    const value = MIN_RISK_CLASS + index;
    return { value: String(value), label: `${value} · ${riskBandLabel(value)}` };
  }),
];

const MIX_OPTIONS = [
  { value: '', label: 'None' },
  ...REFERENCE_MIX_IDS.map((id) => ({ value: id, label: referenceMixName(id) })),
];

function Section({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: React.ReactNode }>) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-title-section text-fg">{title}</h3>
        <p className="text-cell text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function RiskSection({
  form,
  onChange,
}: Readonly<{ form: Form; onChange: (assetClass: AssetClass, value: string) => void }>) {
  return (
    <Section
      title="Default risk class"
      description="The 1 to 7 class each asset class counts with, unless a holding has a risk class of its own. These are assumptions, not published figures."
    >
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {ASSET_CLASSES.map((assetClass) => {
          const range = defaultRiskRange(assetClass);
          return (
            <FormField
              key={assetClass}
              label={ASSET_CLASS_LABELS[assetClass]}
              hint={range ? `Usually ${range[0]} to ${range[1]}` : 'No usual range'}
            >
              <SelectInput
                value={form.risk[assetClass]}
                onChange={(value) => onChange(assetClass, value)}
                options={RISK_OPTIONS}
              />
            </FormField>
          );
        })}
      </div>
    </Section>
  );
}

function MixSection({
  form,
  onRange,
  onSelect,
}: Readonly<{
  form: Form;
  onRange: (id: ReferenceMixId, group: MixGroup, edge: 'min' | 'max', value: string) => void;
  onSelect: (value: string) => void;
}>) {
  return (
    <Section
      title="Reference mixes"
      description="Ranges as a percentage of your investments. A mix is an example from a fund provider, not a target. Choose the one to draw over the bar, or none."
    >
      <FormField label="Show on the chart" className="max-w-xs">
        <SelectInput value={form.selectedMix} onChange={onSelect} options={MIX_OPTIONS} />
      </FormField>
      <div className="grid gap-4 md:grid-cols-2">
        {REFERENCE_MIX_IDS.map((id) => (
          <fieldset key={id} className="rounded-lg border border-border-default p-3">
            <legend className="px-1 text-label text-fg-muted">{referenceMixName(id)}</legend>
            <div className="space-y-2">
              {MIX_GROUPS.map((group) => (
                <div key={group} className="grid grid-cols-[6rem_1fr_1fr] items-center gap-2">
                  <span className="text-cell text-fg-muted">{MIX_GROUP_LABELS[group]}</span>
                  {(['min', 'max'] as const).map((edge) => (
                    <TextInput
                      key={edge}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="any"
                      aria-label={`${referenceMixName(id)}, ${MIX_GROUP_LABELS[group].toLowerCase()}, ${edge === 'min' ? 'minimum' : 'maximum'} percent`}
                      value={form.mixes[id][group][edge]}
                      onChange={(value) => onRange(id, group, edge, value)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </Section>
  );
}

function ThresholdSection({
  form,
  onChange,
}: Readonly<{ form: Form; onChange: (key: ConcentrationThresholdKey, value: string) => void }>) {
  return (
    <Section
      title="Concentration notices"
      description="A notice appears when a share of your investments is above its threshold, as a percentage."
    >
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {CONCENTRATION_THRESHOLD_KEYS.map((key) => (
          <FormField key={key} label={THRESHOLD_LABELS[key]}>
            <TextInput
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              value={form.thresholds[key]}
              onChange={(value) => onChange(key, value)}
            />
          </FormField>
        ))}
      </div>
    </Section>
  );
}

function withRisk(form: Form, assetClass: AssetClass, value: string): Form {
  return { ...form, risk: { ...form.risk, [assetClass]: value } };
}

function withRange(
  form: Form,
  id: ReferenceMixId,
  group: MixGroup,
  edge: 'min' | 'max',
  value: string,
): Form {
  return {
    ...form,
    mixes: {
      ...form.mixes,
      [id]: { ...form.mixes[id], [group]: { ...form.mixes[id][group], [edge]: value } },
    },
  };
}

function withThreshold(form: Form, key: ConcentrationThresholdKey, value: string): Form {
  return { ...form, thresholds: { ...form.thresholds, [key]: value } };
}

function ResetControl({
  confirming,
  pending,
  onAsk,
  onCancel,
  onConfirm,
}: Readonly<{
  confirming: boolean;
  pending: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  if (!confirming) {
    return (
      <Button variant="ghost" onClick={onAsk}>
        Reset to defaults
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-cell text-fg-muted">Reset every setting to the defaults?</span>
      <Button variant="danger" loading={pending} onClick={onConfirm}>
        Reset to defaults
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Keep my settings
      </Button>
    </div>
  );
}

function FormErrors({
  errors,
  failure,
}: Readonly<{ errors: readonly string[]; failure: unknown }>) {
  return (
    <>
      {errors.length > 0 ? (
        <div role="alert" className="rounded-lg border border-danger bg-danger-soft px-3 py-2">
          <p className="text-cell font-medium text-danger">These settings cannot be saved</p>
          <ul className="mt-1 list-disc pl-4 text-cell text-fg-muted">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className="text-cell text-danger">
          {resolveApiErrorMessage(failure, 'The settings could not be saved.')}
        </p>
      ) : null}
    </>
  );
}

/** Edit the risk mapping, the reference mixes and the notice thresholds, or reset them all. */
export function CustomiseModal({
  settings,
  source,
  onClose,
}: Readonly<{ settings: ExposureSettings; source: 'default' | 'custom'; onClose: () => void }>) {
  const [form, setForm] = useState<Form>(() => toForm(settings));
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const save = useSaveExposureSettings();
  const reset = useResetExposureSettings();

  const onSave = () => {
    const parsed = parseExposureSettings(toSettings(form));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors([]);
    save.mutate(parsed.value, { onSuccess: onClose });
  };

  const failure = save.error ?? reset.error;
  return (
    <Modal
      title="Customise exposure"
      subtitle={`Defaults reviewed ${EXPOSURE_DEFAULTS_VERSION}${source === 'custom' ? ' · you have your own settings' : ''}`}
      onClose={onClose}
      maxWidth="3xl"
      scrollable
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={onSave}
          confirmLabel="Save settings"
          loading={save.isPending}
          danger={
            <ResetControl
              confirming={confirmingReset}
              pending={reset.isPending}
              onAsk={() => setConfirmingReset(true)}
              onCancel={() => setConfirmingReset(false)}
              onConfirm={() => reset.mutate(undefined, { onSuccess: onClose })}
            />
          }
        />
      }
    >
      <div className="space-y-6">
        <FormErrors errors={errors} failure={failure} />
        <RiskSection
          form={form}
          onChange={(assetClass, value) =>
            setForm((previous) => withRisk(previous, assetClass, value))
          }
        />
        <MixSection
          form={form}
          onSelect={(selectedMix) => setForm((previous) => ({ ...previous, selectedMix }))}
          onRange={(id, group, edge, value) =>
            setForm((previous) => withRange(previous, id, group, edge, value))
          }
        />
        <ThresholdSection
          form={form}
          onChange={(key, value) => setForm((previous) => withThreshold(previous, key, value))}
        />
      </div>
    </Modal>
  );
}
