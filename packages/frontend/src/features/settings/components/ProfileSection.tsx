/* eslint-disable max-lines-per-function */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { UpdateUserProfileInput, User } from '@quro/shared';
import { MAX_RETIREMENT_AGE, MAX_USER_AGE, MIN_RETIREMENT_AGE, MIN_USER_AGE } from '@quro/shared';
import { Calendar, Mail, MapPin, ShieldCheck, Target } from 'lucide-react';
import { Badge, FormField, TextInput } from '@/components/ui';
import { apiPut, resolveApiErrorMessage } from '@/lib/api';
import { getUserDisplayName } from '@/lib/user';

import {
  type ProfileSectionProps,
  type ProfileFormState,
  toProfileFormState,
  parseWholeNumber,
  buildProfilePayload,
  useSavedState,
  SectionHeader,
  SaveActionButton,
  IconTextInput,
  DEFAULT_ERROR_MESSAGE,
} from './settingsForm';
function useProfileSectionMutation(
  replaceUser: ProfileSectionProps['replaceUser'],
  showSaved: () => void,
) {
  const save = useMutation({
    mutationFn: (payload: UpdateUserProfileInput) => apiPut<User>('/api/settings/profile', payload),
    onSuccess: (response) => {
      replaceUser(response);
      showSaved();
    },
  });
  return save;
}

function ProfileForm({
  user,
  initials,
  saved,
  save,
}: Readonly<
  ProfileSectionProps & { saved: boolean; save: ReturnType<typeof useProfileSectionMutation> }
>) {
  const [form, setForm] = useState<ProfileFormState>(() => toProfileFormState(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formError = save.error ? resolveApiErrorMessage(save.error, DEFAULT_ERROR_MESSAGE) : '';
  const isSaving = save.isPending;

  const yearsAway = (() => {
    const age = parseWholeNumber(form.age);
    const retirementAge = parseWholeNumber(form.retirementAge);
    if (age === null || retirementAge === null || retirementAge <= age) return 0;
    return retirementAge - age;
  })();

  const careerStartAge = 18;
  const currentAge = parseWholeNumber(form.age) ?? user.age;
  const targetRetirementAge = parseWholeNumber(form.retirementAge) ?? user.retirementAge;
  const totalCareerYears = Math.max(1, targetRetirementAge - careerStartAge);
  const careerYearsElapsed = Math.max(0, currentAge - careerStartAge);
  const elapsedPercent = Math.min(100, Math.round((careerYearsElapsed / totalCareerYears) * 100));
  const remainingPercent = Math.max(0, 100 - elapsedPercent);

  const handleSave = () => {
    const nextState = buildProfilePayload(form);
    setErrors(nextState.errors);
    save.reset();

    if (!nextState.payload) return;

    save.mutate(nextState.payload);
  };

  return (
    <div>
      <SectionHeader
        title="Profile"
        subtitle="How Quro identifies you and personalises your planning assumptions."
      />

      <div className="mb-6 flex items-center gap-5 rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-xl font-bold text-white shadow-lg shadow-indigo-200">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">
            {getUserDisplayName(user)}
          </p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <div className="mt-2">
            <Badge tone="brand" size="md">
              <ShieldCheck size={12} />
              Secure account
            </Badge>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <FormField label="First name" required error={errors.firstName}>
          <TextInput
            placeholder="John"
            value={form.firstName}
            error={Boolean(errors.firstName)}
            onChange={(value) => {
              setForm((current) => ({ ...current, firstName: value }));
              setErrors((current) => ({ ...current, firstName: '' }));
            }}
          />
        </FormField>
        <FormField label="Last name" required error={errors.lastName}>
          <TextInput
            placeholder="Doe"
            value={form.lastName}
            error={Boolean(errors.lastName)}
            onChange={(value) => {
              setForm((current) => ({ ...current, lastName: value }));
              setErrors((current) => ({ ...current, lastName: '' }));
            }}
          />
        </FormField>
      </div>

      <div className="mb-4">
        <FormField label="Email address" required error={errors.email}>
          <IconTextInput
            icon={Mail}
            type="email"
            placeholder="you@example.com"
            value={form.email}
            error={Boolean(errors.email)}
            onChange={(value) => {
              setForm((current) => ({ ...current, email: value }));
              setErrors((current) => ({ ...current, email: '' }));
            }}
          />
        </FormField>
      </div>

      <div className="mb-3 grid gap-4 sm:grid-cols-2">
        <FormField
          label="Current age"
          hint="Used for pension projections"
          required
          error={errors.age}
        >
          <IconTextInput
            icon={Calendar}
            type="number"
            inputMode="numeric"
            min={MIN_USER_AGE}
            max={MAX_USER_AGE}
            value={form.age}
            error={Boolean(errors.age)}
            onChange={(value) => {
              setForm((current) => ({ ...current, age: value }));
              setErrors((current) => ({ ...current, age: '' }));
            }}
          />
        </FormField>
        <FormField label="Target retirement age" required error={errors.retirementAge}>
          <IconTextInput
            icon={Target}
            type="number"
            inputMode="numeric"
            min={MIN_RETIREMENT_AGE}
            max={MAX_RETIREMENT_AGE}
            value={form.retirementAge}
            error={Boolean(errors.retirementAge)}
            onChange={(value) => {
              setForm((current) => ({ ...current, retirementAge: value }));
              setErrors((current) => ({ ...current, retirementAge: '' }));
            }}
          />
        </FormField>
      </div>

      {yearsAway > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl bg-slate-950 px-4 py-4 text-center">
            <p className="text-3xl font-semibold text-white">{yearsAway}</p>
            <p className="mt-1 text-xs text-slate-400">Years remaining to retirement</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
            <p className="text-3xl font-semibold text-slate-950">{elapsedPercent}%</p>
            <p className="mt-1 text-xs text-slate-500">Career timeline already elapsed</p>
          </div>
          <div className="rounded-3xl bg-indigo-600 px-4 py-4 text-center">
            <p className="text-3xl font-semibold text-white">{remainingPercent}%</p>
            <p className="mt-1 text-xs text-indigo-100">Runway left to keep contributing</p>
          </div>
        </div>
      ) : null}

      <div className="mb-8">
        <FormField label="Location">
          <IconTextInput
            icon={MapPin}
            placeholder="Amsterdam, Netherlands"
            value={form.location}
            onChange={(value) => {
              setForm((current) => ({ ...current, location: value }));
            }}
          />
        </FormField>
      </div>

      {formError ? (
        <p className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <SaveActionButton
          saved={saved}
          loading={isSaving}
          onClick={() => {
            void handleSave();
          }}
        />
      </div>
    </div>
  );
}

export function ProfileSection(props: Readonly<ProfileSectionProps>) {
  const savedState = useSavedState();
  const save = useProfileSectionMutation(props.replaceUser, savedState.showSaved);
  return (
    <ProfileForm
      key={JSON.stringify([
        props.user.id,
        props.user.firstName,
        props.user.lastName,
        props.user.email,
        props.user.age,
        props.user.retirementAge,
        props.user.location,
      ])}
      {...props}
      saved={savedState.saved}
      save={save}
    />
  );
}
