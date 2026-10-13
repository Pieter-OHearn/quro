import { useState } from 'react';
import { FormField, Modal, PasswordInput, TextInput } from '@/components/ui';
import { useSignInState } from '../hooks';
import type { SignInState } from '../types';
import { PasswordResetForm } from './PasswordResetForm';
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
          autoFocus
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

export function SignInModal({ onClose, onSwitchToSignUp }: Readonly<SignInModalProps>) {
  const state = useSignInState();
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
        <SignInForm
          state={state}
          onSwitchToSignUp={onSwitchToSignUp}
          onForgotPassword={() => setResetting(true)}
        />
      )}
    </Modal>
  );
}
