import { KeyRound, Lock } from 'lucide-react';
import type { RegistrationPolicy } from '@quro/shared';
import { FormField, TextInput } from '@/components/ui';

type InviteCodeFieldProps = {
  policy: RegistrationPolicy | undefined;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

function inviteCodeHelp(policy: RegistrationPolicy | undefined): string {
  if (policy?.setupRequired) {
    return 'This Quro instance has no accounts yet. Whoever runs the server issues a one-time setup code with `quro user invite`.';
  }
  if (policy?.signUp === 'code') {
    return 'Ask the operator of this Quro instance for a single-use invite code.';
  }
  return 'Only needed if the operator of this Quro instance gave you one.';
}

/** Shown unless the instance allows open registration. */
export function InviteCodeField({
  policy,
  value,
  error,
  onChange,
}: Readonly<InviteCodeFieldProps>) {
  return (
    <FormField
      label={
        <span className="inline-flex items-center gap-2">
          <KeyRound size={14} className="text-fg-faint" />
          <span>{policy?.setupRequired ? 'Setup code' : 'Invite code'}</span>
        </span>
      }
      required={policy?.signUp === 'code'}
      error={error}
      className="sm:col-span-2"
    >
      <TextInput
        data-testid="signup-invite-code-input"
        type="text"
        autoFocus
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX"
        error={Boolean(error)}
        value={value}
        onChange={onChange}
      />
      <p className="mt-1.5 text-xs text-fg-subtle">{inviteCodeHelp(policy)}</p>
    </FormField>
  );
}

export function RegistrationClosedNotice({
  onSwitchToSignIn,
}: Readonly<{ onSwitchToSignIn: () => void }>) {
  return (
    <div className="space-y-4 px-8 py-7 text-center text-fg">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-muted">
        <Lock size={18} className="text-fg-muted" />
      </div>
      <p className="text-sm font-semibold">Registration is closed</p>
      <p className="text-sm text-fg-subtle">
        This Quro instance does not take new sign-ups. Ask its operator if you need an account.
      </p>
      <p className="pb-1 text-sm text-fg-subtle">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="font-semibold text-brand transition-colors hover:text-brand-strong"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
