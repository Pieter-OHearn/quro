import { ArrowRight } from 'lucide-react';
import { FormField, Modal, PasswordInput, QuroLogo, TextInput } from '@/components/ui';
import { useSignInState } from '../hooks';
import type { SignInState } from '../types';
import { SubmitButton } from './SubmitButton';

type SignInModalProps = {
  onClose: () => void;
  onSwitchToSignUp: () => void;
};

type SignInFormProps = {
  state: SignInState;
  onSwitchToSignUp: () => void;
};

function SignInFormFields({ state }: Readonly<{ state: SignInState }>) {
  const { email, setEmail, password, setPassword, showPw, toggleShowPw, errors, clearError } =
    state;

  return (
    <>
      <FormField label="Email address" error={errors.email}>
        <TextInput
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
    </>
  );
}

function SignInForm({ state, onSwitchToSignUp }: Readonly<SignInFormProps>) {
  const { loading, handleSubmit } = state;

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="space-y-4 px-8 py-7 text-slate-900"
    >
      <SignInFormFields state={state} />
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
      <p className="pt-1 text-center text-sm text-slate-500">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignUp}
          className="font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
        >
          Sign up free
        </button>
      </p>
    </form>
  );
}

export function SignInModal({ onClose, onSwitchToSignUp }: Readonly<SignInModalProps>) {
  const state = useSignInState();

  return (
    <Modal
      title="Welcome back"
      subtitle="Sign in to your Quro account"
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
        className: 'bg-gradient-to-br from-[#0a0f1e] to-[#1a2550] px-8 pb-10 pt-8',
        titleClassName: 'text-2xl font-black tracking-tight',
        subtitleClassName: 'mt-1 text-sm',
        closeIconSize: 16,
      }}
    >
      <SignInForm state={state} onSwitchToSignUp={onSwitchToSignUp} />
    </Modal>
  );
}
