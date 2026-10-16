/* eslint-disable max-lines-per-function */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { UpdateUserProfileInput, User } from '@quro/shared';
import {
  MAX_RETIREMENT_AGE,
  MAX_USER_AGE,
  MIN_RETIREMENT_AGE,
  MIN_USER_AGE,
  TEXT_FIELD_LIMITS,
} from '@quro/shared';
import { CalendarClock, Hourglass, TrendingUp } from 'lucide-react';
import { FormField, StatCard, TextInput } from '@/components/ui';
import { apiPut, resolveApiErrorMessage } from '@/lib/api';

import {
  type ProfileSectionProps,
  type ProfileFormState,
  toProfileFormState,
  parseWholeNumber,
  buildProfilePayload,
  useSavedState,
  SettingsCard,
  FormErrorNotice,
  SaveActionButton,
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
    <SettingsCard
      title="Profile"
      subtitle="How Quro identifies you and personalises your planning assumptions."
      footer={
        <SaveActionButton
          saved={saved}
          loading={isSaving}
          onClick={() => {
            void handleSave();
          }}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="First name" required error={errors.firstName}>
          <TextInput
            placeholder="John"
            value={form.firstName}
            maxLength={TEXT_FIELD_LIMITS.profile.firstName}
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
            maxLength={TEXT_FIELD_LIMITS.profile.lastName}
            error={Boolean(errors.lastName)}
            onChange={(value) => {
              setForm((current) => ({ ...current, lastName: value }));
              setErrors((current) => ({ ...current, lastName: '' }));
            }}
          />
        </FormField>
      </div>

      <FormField label="Email address" required error={errors.email}>
        <TextInput
          type="email"
          placeholder="you@example.com"
          value={form.email}
          maxLength={TEXT_FIELD_LIMITS.profile.email}
          error={Boolean(errors.email)}
          onChange={(value) => {
            setForm((current) => ({ ...current, email: value }));
            setErrors((current) => ({ ...current, email: '' }));
          }}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Current age"
          hint="Used for pension projections"
          required
          error={errors.age}
        >
          <TextInput
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
          <TextInput
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
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Years remaining to retirement"
            value={String(yearsAway)}
            icon={Hourglass}
            color="indigo"
          />
          <StatCard
            label="Career timeline already elapsed"
            value={`${elapsedPercent}%`}
            icon={CalendarClock}
            color="indigo"
          />
          <StatCard
            label="Runway left to keep contributing"
            value={`${remainingPercent}%`}
            icon={TrendingUp}
            color="indigo"
          />
        </div>
      ) : null}

      <FormField label="Location">
        <TextInput
          placeholder="Amsterdam, Netherlands"
          value={form.location}
          maxLength={TEXT_FIELD_LIMITS.profile.location}
          onChange={(value) => {
            setForm((current) => ({ ...current, location: value }));
          }}
        />
      </FormField>

      {formError ? <FormErrorNotice>{formError}</FormErrorNotice> : null}
    </SettingsCard>
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
