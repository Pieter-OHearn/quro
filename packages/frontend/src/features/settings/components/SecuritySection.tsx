import { useMutation } from '@tanstack/react-query';
/* eslint-disable max-lines-per-function */
import { useState } from 'react';
import type { UpdateUserPasswordInput, User } from '@quro/shared';
import { MIN_PASSWORD_LENGTH } from '@quro/shared';
import { AlertTriangle, Check, ShieldCheck } from 'lucide-react';
import { FormField, PasswordInput } from '@/components/ui';
import { apiPut, resolveApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import {
  type SecuritySectionProps,
  type PasswordFormState,
  createEmptyPasswordForm,
  getPasswordStrength,
  formatPasswordChangedAt,
  useSavedState,
  SectionHeader,
  SaveActionButton,
  DEFAULT_ERROR_MESSAGE,
} from './settingsForm';
export function SecuritySection({ user, replaceUser }: Readonly<SecuritySectionProps>) {
  const [form, setForm] = useState<PasswordFormState>(() => createEmptyPasswordForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { saved, showSaved } = useSavedState();

  const save = useMutation({
    mutationFn: (payload: UpdateUserPasswordInput) =>
      apiPut<User>('/api/settings/password', payload),
    onSuccess: (response) => {
      replaceUser(response);
      setForm(createEmptyPasswordForm());
      showSaved();
    },
    onError: (error) => {
      const message = resolveApiErrorMessage(error, DEFAULT_ERROR_MESSAGE);
      if (message === 'Current password is incorrect') {
        setErrors((current) => ({ ...current, currentPassword: message }));
      }
    },
  });
  const message = save.error ? resolveApiErrorMessage(save.error, DEFAULT_ERROR_MESSAGE) : '';
  const formError = message === 'Current password is incorrect' ? '' : message;
  const isSaving = save.isPending;
  const strength = getPasswordStrength(form.nextPassword);

  const handleSave = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.currentPassword) nextErrors.currentPassword = 'Enter your current password';
    if (form.nextPassword.length < MIN_PASSWORD_LENGTH) {
      nextErrors.nextPassword = `Must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (form.nextPassword !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(nextErrors);
    save.reset();
    if (Object.keys(nextErrors).length > 0) return;

    const payload: UpdateUserPasswordInput = {
      currentPassword: form.currentPassword,
      nextPassword: form.nextPassword,
    };

    save.mutate(payload);
  };

  return (
    <div>
      <SectionHeader
        title="Security"
        subtitle="Change your password and keep your account credentials current."
      />

      <div className="mb-6 flex items-center gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50">
          <ShieldCheck size={18} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Password protected</p>
          <p className="text-xs text-slate-500">
            Last changed: {formatPasswordChangedAt(user.passwordUpdatedAt)}
          </p>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        <FormField label="Current password" required error={errors.currentPassword}>
          <PasswordInput
            placeholder="Enter current password"
            value={form.currentPassword}
            show={showCurrentPassword}
            error={Boolean(errors.currentPassword)}
            onChange={(value) => {
              setForm((current) => ({ ...current, currentPassword: value }));
              setErrors((current) => ({ ...current, currentPassword: '' }));
            }}
            onToggle={() => setShowCurrentPassword((current) => !current)}
          />
        </FormField>

        <FormField label="New password" required error={errors.nextPassword}>
          <PasswordInput
            placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
            value={form.nextPassword}
            show={showNextPassword}
            error={Boolean(errors.nextPassword)}
            onChange={(value) => {
              setForm((current) => ({ ...current, nextPassword: value }));
              setErrors((current) => ({ ...current, nextPassword: '' }));
            }}
            onToggle={() => setShowNextPassword((current) => !current)}
          />
          {form.nextPassword ? (
            <div className="mt-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((index) => (
                  <div
                    key={index}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors',
                      index <= strength.score ? strength.barClassName : 'bg-slate-200',
                    )}
                  />
                ))}
                <span className={cn('ml-2 text-xs font-semibold', strength.textClassName)}>
                  {strength.label}
                </span>
              </div>
              <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
                {[
                  {
                    label: `${MIN_PASSWORD_LENGTH}+ characters`,
                    valid: form.nextPassword.length >= MIN_PASSWORD_LENGTH,
                  },
                  { label: 'Uppercase letter', valid: /[A-Z]/.test(form.nextPassword) },
                  { label: 'Number', valid: /[0-9]/.test(form.nextPassword) },
                  { label: 'Symbol', valid: /[^A-Za-z0-9]/.test(form.nextPassword) },
                ].map((item) => (
                  <p
                    key={item.label}
                    className={cn(
                      'flex items-center gap-1.5',
                      item.valid ? 'text-emerald-600' : 'text-slate-400',
                    )}
                  >
                    <Check size={12} className={item.valid ? 'opacity-100' : 'opacity-0'} />
                    {item.label}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </FormField>

        <FormField label="Confirm new password" required error={errors.confirmPassword}>
          <PasswordInput
            placeholder="Re-enter new password"
            value={form.confirmPassword}
            show={showConfirmPassword}
            error={Boolean(errors.confirmPassword)}
            onChange={(value) => {
              setForm((current) => ({ ...current, confirmPassword: value }));
              setErrors((current) => ({ ...current, confirmPassword: '' }));
            }}
            onToggle={() => setShowConfirmPassword((current) => !current)}
          />
          {form.confirmPassword && form.confirmPassword === form.nextPassword ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <Check size={12} />
              Passwords match
            </p>
          ) : null}
        </FormField>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          Use a password you are not reusing anywhere else. Quro stores password hashes, not raw
          passwords.
        </p>
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
