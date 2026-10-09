import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { FormField, Modal, PasswordInput, QuroLogo, TextInput } from '@/components/ui';
import { useSignInState } from '../hooks';
import type { SignInState } from '../types';
import { PasswordResetForm } from './PasswordResetForm';
import { SubmitButton } from './SubmitButton';

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
      <div className="-mt-2 text-right">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-xs font-semibold text-brand transition-colors hover:text-brand-strong"
        >
          Forgot password?
        </button>
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
      className="space-y-4 px-8 py-7 text-fg"
    >
      <SignInFormFields state={state} onForgotPassword={onForgotPassword} />
      <SubmitButton
        loading={loading}
        loadingText="Signing in…"
        idleContent={
          <>
            <span>Sign In</span>
            <ArrowRight size={15} />
          </>
        }
      />
      <p className="pt-1 text-center text-sm text-fg-subtle">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignUp}
          className="font-semibold text-brand transition-colors hover:text-brand-strong"
        >
          Sign up free
        </button>
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
      bodyClassName="space-y-0 p-0"
      headerProps={{
        align: 'center',
        visual: (
          <div className="mb-4 flex justify-center">
            <QuroLogo size={52} showBg={false} />
          </div>
        ),
        className: 'bg-gradient-to-br from-surface-inverse to-surface-auth-end px-8 pb-10 pt-8',
        titleClassName: 'text-2xl font-black tracking-tight',
        subtitleClassName: 'mt-1 text-sm',
        closeIconSize: 16,
      }}
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
