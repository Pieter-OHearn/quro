import { useEffect, useState } from 'react';
import { FormField, Modal, PasswordInput, TextInput } from '@/components/ui';
import { useRegistrationPolicy, useSignInState } from '../hooks';
import type { SignInState } from '../types';
import { SSO_ERROR_PARAM, ssoErrorMessage } from '../utils/sso-error';
import { PasswordResetForm } from './PasswordResetForm';
import { SignInChoices, SingleSignOnNotice } from './SingleSignOn';
import { SubmitButton } from './SubmitButton';
import { TextLinkButton } from './TextLinkButton';

type SignInModalProps = {
  onClose: () => void;
  onSwitchToSignUp: () => void;
};

type SignInFormProps = {
  state: SignInState;
  onSwitchToSignUp: () => void;
  onForgotPassword: () => void;
};

function SignInFormFields({
  state,
  onForgotPassword,
}: Readonly<{ state: SignInState; onForgotPassword: () => void }>) {
  const { email, setEmail, password, setPassword, showPw, toggleShowPw, errors, clearError } =
    state;

  return (
    <>
      <FormField label="Email address" error={errors.email}>
        <TextInput
          data-testid="signin-email-input"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={Boolean(errors.email)}
          value={email}
          onChange={(value) => {
            setEmail(value);
            clearError('email');
          }}
        />
      </FormField>
      <FormField label="Password" error={errors.password}>
        <PasswordInput
          data-testid="signin-password-input"
          value={password}
          placeholder="••••••••"
          autoComplete="current-password"
          show={showPw}
          onToggle={toggleShowPw}
          onChange={(value) => {
            setPassword(value);
            clearError('password');
          }}
          error={Boolean(errors.password)}
        />
      </FormField>
      <div className="-mt-2 text-right text-label">
        <TextLinkButton onClick={onForgotPassword}>Forgot password?</TextLinkButton>
      </div>
    </>
  );
}

function SignInForm({ state, onSwitchToSignUp, onForgotPassword }: Readonly<SignInFormProps>) {
  const { loading, handleSubmit } = state;

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="space-y-4"
    >
      <SignInFormFields state={state} onForgotPassword={onForgotPassword} />
      <SubmitButton loading={loading} loadingText="Signing in…" idleContent="Sign in" />
      <p className="text-center text-cell text-fg-muted">
        Don't have an account?{' '}
        <TextLinkButton onClick={onSwitchToSignUp}>Sign up free</TextLinkButton>
      </p>
    </form>
  );
}

// The reason a provider sign-in failed, read once from the address and then removed from it.
function useSsoFailure(): string | null {
  const [code] = useState(() => new URLSearchParams(window.location.search).get(SSO_ERROR_PARAM));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has(SSO_ERROR_PARAM)) {
      url.searchParams.delete(SSO_ERROR_PARAM);
      window.history.replaceState(window.history.state, '', url);
    }
  }, []);
  return code;
}

export function SignInModal({ onClose, onSwitchToSignUp }: Readonly<SignInModalProps>) {
  const state = useSignInState();
  const { data: policy, isPending } = useRegistrationPolicy();
  const ssoFailureCode = useSsoFailure();
  const ssoFailure = ssoErrorMessage(ssoFailureCode, policy?.passwordLogin !== false);
  const [resetting, setResetting] = useState(false);

  return (
    <Modal
      title={resetting ? 'Reset your password' : 'Welcome back'}
      subtitle={resetting ? 'Use the code from your Quro operator' : 'Sign in to your Quro account'}
      onClose={onClose}
      maxWidth="md"
    >
      {resetting ? (
        <PasswordResetForm onBackToSignIn={() => setResetting(false)} />
      ) : (
        <div className="space-y-4">
          {ssoFailure && <SingleSignOnNotice message={ssoFailure} />}
          <SignInChoices
            policy={policy}
            pending={isPending}
            passwordForm={
              <SignInForm
                state={state}
                onSwitchToSignUp={onSwitchToSignUp}
                onForgotPassword={() => setResetting(true)}
              />
            }
          />
        </div>
      )}
    </Modal>
  );
}
