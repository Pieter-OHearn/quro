import { useMutation, useQueryClient } from '@tanstack/react-query';
/* eslint-disable max-lines-per-function */
import { useState } from 'react';
import type { UpdateUserPasswordInput, User } from '@quro/shared';
import { MIN_PASSWORD_LENGTH } from '@quro/shared';
import { AlertTriangle, Check, ShieldCheck } from 'lucide-react';
import { FormField, PasswordInput } from '@/components/ui';
import { apiPut, resolveApiErrorMessage } from '@/lib/api';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { cn } from '@/lib/utils';

import {
  type SecuritySectionProps,
  type PasswordFormState,
  createEmptyPasswordForm,
  getPasswordStrength,
  formatPasswordChangedAt,
  useSavedState,
  SettingsCard,
  FormErrorNotice,
  SaveActionButton,
  DEFAULT_ERROR_MESSAGE,
} from './settingsForm';
import { SessionsPanel } from './SessionsPanel';
export function SecuritySection({ user, replaceUser }: Readonly<SecuritySectionProps>) {
  const [form, setForm] = useState<PasswordFormState>(() => createEmptyPasswordForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { saved, showSaved } = useSavedState();
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (payload: UpdateUserPasswordInput) =>
      apiPut<User>('/api/settings/password', payload),
    onSuccess: (response) => {
      replaceUser(response);
      setForm(createEmptyPasswordForm());
      showSaved();
      // Changing the password signs out every other browser.
      void invalidateDomain(queryClient, 'sessions');
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
    <div className="space-y-4">
      <SettingsCard
        title="Security"
        subtitle="Change your password and sign out browsers you no longer use."
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
        <div className="flex items-start gap-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <p className="text-body font-medium text-fg">Password protected</p>
            <p className="text-caption text-fg-subtle">
              Last changed: {formatPasswordChangedAt(user.passwordUpdatedAt)}
            </p>
          </div>
        </div>

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
            <div className="mt-2">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((index) => (
                  <div
                    key={index}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors duration-fast',
                      index <= strength.score ? strength.barClassName : 'bg-surface-muted',
                    )}
                  />
                ))}
                <span className={cn('ml-2 text-label', strength.textClassName)}>
                  {strength.label}
                </span>
              </div>
              <div className="mt-2 grid gap-1 text-caption sm:grid-cols-2">
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
                      item.valid ? 'text-success' : 'text-fg-subtle',
                    )}
                  >
                    <Check
                      size={12}
                      className={item.valid ? 'opacity-100' : 'opacity-0'}
                      aria-hidden="true"
                    />
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
            <p className="mt-1 flex items-center gap-1.5 text-caption font-medium text-success">
              <Check size={12} aria-hidden="true" />
              Passwords match
            </p>
          ) : null}
        </FormField>

        <div className="flex items-start gap-2 rounded-md border border-warning bg-warning-soft p-3 text-cell text-warning">
          <AlertTriangle size={16} className="mt-px shrink-0" aria-hidden="true" />
          <p>
            Use a password you are not reusing anywhere else. Quro stores password hashes, not raw
            passwords.
          </p>
        </div>

        {formError ? <FormErrorNotice>{formError}</FormErrorNotice> : null}
      </SettingsCard>

      <SessionsPanel />
    </div>
  );
}
