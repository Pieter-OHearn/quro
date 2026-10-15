import { MIN_PASSWORD_LENGTH } from '@quro/shared';
import { FormField, PasswordInput, TextInput } from '@/components/ui';
import { usePasswordResetState } from '../hooks';
import type { PasswordResetState } from '../types';
import { SubmitButton } from './SubmitButton';
import { TextLinkButton } from './TextLinkButton';

type PasswordResetFormProps = {
  onBackToSignIn: () => void;
};

export function PasswordResetHelp() {
  return (
    <p className="rounded-md border border-border-default bg-surface-sunken p-3 text-cell text-fg-muted">
      Quro does not send email. Ask the operator of this Quro instance to run{' '}
      <code className="font-medium text-fg">quro user reset-password</code> with your email address.
      They give you a one-time code that expires after an hour.
    </p>
  );
}

function PasswordResetFields({ state }: Readonly<{ state: PasswordResetState }>) {
  const { form, setField, errors, showPw, toggleShowPw } = state;
  return (
    <>
      <FormField label="Reset code" error={errors.code}>
        <TextInput
          data-testid="password-reset-code-input"
          type="text"
          autoFocus
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX"
          error={Boolean(errors.code)}
          value={form.code}
          onChange={(value) => setField('code', value)}
        />
      </FormField>
      <FormField label="New password" error={errors.nextPassword}>
        <PasswordInput
          data-testid="password-reset-password-input"
          value={form.nextPassword}
          placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          show={showPw}
          onToggle={toggleShowPw}
          onChange={(value) => setField('nextPassword', value)}
          error={Boolean(errors.nextPassword)}
        />
      </FormField>
      <FormField label="Confirm new password" error={errors.confirm}>
        <PasswordInput
          data-testid="password-reset-confirm-input"
          value={form.confirm}
          placeholder="Re-enter password"
          autoComplete="new-password"
          show={showPw}
          onToggle={toggleShowPw}
          onChange={(value) => setField('confirm', value)}
          error={Boolean(errors.confirm)}
        />
      </FormField>
    </>
  );
}

export function PasswordResetForm({ onBackToSignIn }: Readonly<PasswordResetFormProps>) {
  const state = usePasswordResetState();

  return (
    <form
      onSubmit={(event) => {
        void state.handleSubmit(event);
      }}
      className="space-y-4"
    >
      <PasswordResetHelp />
      <PasswordResetFields state={state} />
      <SubmitButton
        loading={state.loading}
        loadingText="Saving password…"
        idleContent={<span>Set new password and sign in</span>}
      />
      <p className="text-center text-cell text-fg-muted">
        Remembered it? <TextLinkButton onClick={onBackToSignIn}>Back to sign in</TextLinkButton>
      </p>
    </form>
  );
}
