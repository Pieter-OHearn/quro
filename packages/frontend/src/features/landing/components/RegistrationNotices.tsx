import type { RegistrationPolicy } from '@quro/shared';
import { FormField, TextInput } from '@/components/ui';
import { TextLinkButton } from './TextLinkButton';

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
      label={policy?.setupRequired ? 'Setup code' : 'Invite code'}
      required={policy?.signUp === 'code'}
      error={error}
      className="sm:col-span-2"
    >
      <TextInput
        data-testid="signup-invite-code-input"
        type="text"
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX"
        error={Boolean(error)}
        value={value}
        onChange={onChange}
      />
      <p className="mt-1 text-caption text-fg-subtle">{inviteCodeHelp(policy)}</p>
    </FormField>
  );
}

type RegistrationClosedNoticeProps = {
  onSwitchToSignIn: () => void;
  /** The provider's name when the operator turned passwords off, so nobody signs up. */
  singleSignOnOnly?: string | null;
};

export function RegistrationClosedNotice({
  onSwitchToSignIn,
  singleSignOnOnly = null,
}: Readonly<RegistrationClosedNoticeProps>) {
  if (singleSignOnOnly) {
    return (
      <div className="space-y-2" data-testid="signup-sso-only">
        <p className="text-title-section text-fg">Accounts are created by the operator</p>
        <p className="text-body text-fg-muted">
          This Quro instance has no sign-up and no passwords. Ask its operator to create an account
          for your email address, then sign in with {singleSignOnOnly}.
        </p>
        <p className="text-cell text-fg-muted">
          <TextLinkButton onClick={onSwitchToSignIn}>Sign in</TextLinkButton>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-title-section text-fg">Registration is closed</p>
      <p className="text-body text-fg-muted">
        This Quro instance does not take new sign-ups. Ask its operator if you need an account.
      </p>
      <p className="text-cell text-fg-muted">
        Already have an account? <TextLinkButton onClick={onSwitchToSignIn}>Sign in</TextLinkButton>
      </p>
    </div>
  );
}
