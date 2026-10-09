import { invalidateDomain } from '@/lib/queryInvalidation';
/* eslint-disable max-lines-per-function */
import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import type {
  CurrencyCode,
  JurisdictionCode,
  NumberFormatPreference,
  UpdateUserPreferencesInput,
  User,
} from '@quro/shared';
import { formatNumber, NUMBER_FORMATS, JURISDICTION_CODES } from '@quro/shared';
import { Check, MapPin, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui';
import { CURRENCY_CODES, CURRENCY_META } from '@/lib/CurrencyContext';
import { apiPut, resolveApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import { AppearanceSetting } from './AppearanceSetting';
import {
  type PreferencesSectionProps,
  useSavedState,
  SectionHeader,
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
    <div>
      <SectionHeader
        title="Preferences"
        subtitle="Choose the app-wide defaults that drive balances, charts, and totals."
      />

      <div className="mb-8">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-fg-subtle">
          <SlidersHorizontal size={14} className="text-brand-accent" />
          Base Currency
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CURRENCY_CODES.map((code) => {
            const currency = CURRENCY_META[code];
            const isSelected = code === selectedCurrency;

            return (
              <button
                key={code}
                type="button"
                onClick={() => setSelectedCurrency(code)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all',
                  isSelected
                    ? 'border-brand-border bg-brand-soft text-brand-fg shadow-sm shadow-brand-soft-strong'
                    : 'border-border-default bg-surface text-fg-muted hover:border-brand-tint hover:bg-surface-sunken',
                )}
              >
                <span className="text-2xl leading-none">{currency.flag}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{code}</p>
                  <p className="text-xs text-fg-faint">{currency.name}</p>
                </div>
                {isSelected ? <Check size={16} className="ml-auto text-brand" /> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-fg-subtle">
          Cross-currency balances and charts convert into this currency across the app.
        </p>
      </div>

      <div className="mb-8 border-t border-border-subtle pt-6">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-fg-subtle">
          <MapPin size={14} className="text-brand" />
          Planning jurisdiction
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {JURISDICTION_CODES.map((code) => {
            const isSelected = code === selectedJurisdiction;
            const labels: Record<JurisdictionCode, { name: string; note: string }> = {
              NL: { name: 'Netherlands', note: 'Dutch benefit and severance rules' },
              AU: { name: 'Australia', note: 'Australian employment and redundancy rules' },
              GENERIC: { name: 'Generic', note: 'Conservative international defaults' },
            };
            return (
              <button
                key={code}
                type="button"
                onClick={() => setSelectedJurisdiction(code)}
                className={cn(
                  'rounded-2xl border px-4 py-4 text-left transition-all duration-base ease-standard',
                  isSelected
                    ? 'border-brand-border bg-brand-soft text-brand-fg shadow-brand'
                    : 'border-border-default bg-surface text-fg-muted hover:border-brand-border hover:bg-surface-sunken',
                )}
              >
                <div className="flex items-start gap-3">
                  <div>
                    <p className="text-sm font-semibold">{labels[code].name}</p>
                    <p className="mt-1 text-xs text-fg-faint">{labels[code].note}</p>
                  </div>
                  {isSelected ? <Check size={16} className="ml-auto text-brand" /> : null}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-fg-subtle">
          Planning rules are independent from the currency used to display balances.
        </p>
      </div>

      <div className="mb-8 border-t border-border-subtle pt-6">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-fg-subtle">
          <SlidersHorizontal size={14} className="text-brand-accent" />
          Number Format
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {NUMBER_FORMATS.map((numberFormat) => {
            const isSelected = numberFormat === selectedNumberFormat;
            const sample = formatNumber(1000, numberFormat, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });

            return (
              <button
                key={numberFormat}
                type="button"
                onClick={() => setSelectedNumberFormat(numberFormat)}
                className={cn(
                  'rounded-2xl border px-4 py-4 text-left transition-all',
                  isSelected
                    ? 'border-brand-border bg-brand-soft text-brand-fg shadow-sm shadow-brand-soft-strong'
                    : 'border-border-default bg-surface text-fg-muted hover:border-brand-tint hover:bg-surface-sunken',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {numberFormat === 'en-US' ? '1,000.00 style' : '1.000,00 style'}
                    </p>
                    <p className="mt-1 text-xs text-fg-faint">
                      Example: <span className="font-semibold text-fg-muted">{sample}</span>
                    </p>
                  </div>
                  {isSelected ? <Check size={16} className="ml-auto text-brand" /> : null}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-fg-subtle">
          Controls decimal and thousands separators anywhere Quro formats amounts.
        </p>
      </div>

      <AppearanceSetting />

      <div className="mb-8 border-t border-border-subtle pt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-fg-subtle">
          Coming Soon
        </p>
        <div className="space-y-2">
          {[
            'Email and push notifications',
            'Two-factor authentication',
            'CSV and PDF export packs',
          ].map((item) => (
            <div
              key={item}
              className="flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-sunken px-4 py-3"
            >
              <span className="text-sm text-fg-subtle">{item}</span>
              <Badge tone="muted">Soon</Badge>
            </div>
          ))}
        </div>
      </div>

      {formError ? (
        <p className="mb-4 rounded-2xl border border-danger-soft-strong bg-danger-soft px-4 py-3 text-sm text-danger-hover">
          {formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <SaveActionButton
          saved={saved}
          loading={isSaving}
          disabled={!hasChanges}
          onClick={() => {
            void handleSave();
          }}
        />
      </div>
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
