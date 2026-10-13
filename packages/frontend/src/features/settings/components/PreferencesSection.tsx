import { invalidateDomain } from '@/lib/queryInvalidation';
/* eslint-disable max-lines-per-function */
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import type {
  CurrencyCode,
  JurisdictionCode,
  NumberFormatPreference,
  UpdateUserPreferencesInput,
  User,
} from '@quro/shared';
import { formatNumber, NUMBER_FORMATS, JURISDICTION_CODES } from '@quro/shared';
import { Badge } from '@/components/ui';
import { CURRENCY_CODES, CURRENCY_META } from '@/lib/CurrencyContext';
import { apiPut, resolveApiErrorMessage } from '@/lib/api';

import { AppearanceSetting } from './AppearanceSetting';
import {
  type PreferencesSectionProps,
  useSavedState,
  SettingsCard,
  ChoiceButton,
  FormErrorNotice,
  SaveActionButton,
  DEFAULT_ERROR_MESSAGE,
} from './settingsForm';
function usePreferencesSectionMutation(
  replaceUser: PreferencesSectionProps['replaceUser'],
  showSaved: () => void,
) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (payload: UpdateUserPreferencesInput) =>
      apiPut<User>('/api/settings/preferences', payload),
    onSuccess: async (response) => {
      replaceUser(response);
      await invalidateDomain(queryClient, 'preferences');
      showSaved();
    },
  });
  return save;
}

const JURISDICTION_LABELS: Record<JurisdictionCode, { name: string; note: string }> = {
  NL: { name: 'Netherlands', note: 'Dutch benefit and severance rules' },
  AU: { name: 'Australia', note: 'Australian employment and redundancy rules' },
  GENERIC: { name: 'Generic', note: 'Conservative international defaults' },
};

const COMING_SOON_ITEMS = [
  'Email and push notifications',
  'Two-factor authentication',
  'CSV and PDF export packs',
];

type ChoiceGroupProps = {
  label: string;
  description: string;
  className: string;
  children: ReactNode;
};

/** A labelled group of choices with a line of help under it. */
function ChoiceGroup({ label, description, className, children }: Readonly<ChoiceGroupProps>) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <p id={labelId} className="mb-2 text-label text-fg-muted">
        {label}
      </p>
      <div className={className}>{children}</div>
      <p className="mt-2 text-caption text-fg-subtle">{description}</p>
    </div>
  );
}

function ChoiceText({ title, note }: Readonly<{ title: ReactNode; note: ReactNode }>) {
  return (
    <>
      <span className="block text-cell font-medium">{title}</span>
      <span className="block text-caption text-fg-muted">{note}</span>
    </>
  );
}

function ComingSoonCard() {
  return (
    <SettingsCard title="Coming soon" flush>
      <ul className="divide-y divide-border-subtle">
        {COMING_SOON_ITEMS.map((item) => (
          <li key={item} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
            <span className="text-cell text-fg-muted">{item}</span>
            <Badge tone="muted">Soon</Badge>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

function PreferencesForm({
  user,
  saved,
  save,
}: Readonly<
  PreferencesSectionProps & {
    saved: boolean;
    save: ReturnType<typeof usePreferencesSectionMutation>;
  }
>) {
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(user.baseCurrency);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<JurisdictionCode>(
    user.jurisdiction,
  );
  const [selectedNumberFormat, setSelectedNumberFormat] = useState<NumberFormatPreference>(
    user.numberFormat,
  );
  const formError = save.error ? resolveApiErrorMessage(save.error, DEFAULT_ERROR_MESSAGE) : '';
  const isSaving = save.isPending;
  const hasChanges =
    selectedCurrency !== user.baseCurrency ||
    selectedNumberFormat !== user.numberFormat ||
    selectedJurisdiction !== user.jurisdiction;

  const handleSave = () => {
    const payload: UpdateUserPreferencesInput = {
      baseCurrency: selectedCurrency,
      numberFormat: selectedNumberFormat,
      jurisdiction: selectedJurisdiction,
    };

    save.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Preferences"
        subtitle="Choose the app-wide defaults that drive balances, charts, and totals."
        footer={
          <SaveActionButton
            saved={saved}
            loading={isSaving}
            disabled={!hasChanges}
            onClick={() => {
              void handleSave();
            }}
          />
        }
      >
        <ChoiceGroup
          label="Base currency"
          description="Cross-currency balances and charts convert into this currency across the app."
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {CURRENCY_CODES.map((code) => {
            const currency = CURRENCY_META[code];
            return (
              <ChoiceButton
                key={code}
                selected={code === selectedCurrency}
                onSelect={() => setSelectedCurrency(code)}
              >
                <span className="flex items-center gap-2">
                  <span className="text-title-section leading-none" aria-hidden="true">
                    {currency.flag}
                  </span>
                  <span className="min-w-0">
                    <ChoiceText title={code} note={currency.name} />
                  </span>
                </span>
              </ChoiceButton>
            );
          })}
        </ChoiceGroup>

        <ChoiceGroup
          label="Planning jurisdiction"
          description="Planning rules are independent from the currency used to display balances."
          className="grid gap-2 md:grid-cols-3"
        >
          {JURISDICTION_CODES.map((code) => (
            <ChoiceButton
              key={code}
              selected={code === selectedJurisdiction}
              onSelect={() => setSelectedJurisdiction(code)}
            >
              <ChoiceText
                title={JURISDICTION_LABELS[code].name}
                note={JURISDICTION_LABELS[code].note}
              />
            </ChoiceButton>
          ))}
        </ChoiceGroup>

        <ChoiceGroup
          label="Number format"
          description="Controls decimal and thousands separators anywhere Quro formats amounts."
          className="grid gap-2 md:grid-cols-2"
        >
          {NUMBER_FORMATS.map((numberFormat) => {
            const sample = formatNumber(1000, numberFormat, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            return (
              <ChoiceButton
                key={numberFormat}
                selected={numberFormat === selectedNumberFormat}
                onSelect={() => setSelectedNumberFormat(numberFormat)}
              >
                <ChoiceText
                  title={numberFormat === 'en-US' ? '1,000.00 style' : '1.000,00 style'}
                  note={
                    <>
                      Example: <span className="font-numeric font-medium text-fg">{sample}</span>
                    </>
                  }
                />
              </ChoiceButton>
            );
          })}
        </ChoiceGroup>

        {formError ? <FormErrorNotice>{formError}</FormErrorNotice> : null}
      </SettingsCard>

      <AppearanceSetting />
      <ComingSoonCard />
    </div>
  );
}

export function PreferencesSection(props: Readonly<PreferencesSectionProps>) {
  const savedState = useSavedState();
  const save = usePreferencesSectionMutation(props.replaceUser, savedState.showSaved);
  return (
    <PreferencesForm
      key={JSON.stringify([
        props.user.id,
        props.user.baseCurrency,
        props.user.jurisdiction,
        props.user.numberFormat,
      ])}
      {...props}
      saved={savedState.saved}
      save={save}
    />
  );
}
