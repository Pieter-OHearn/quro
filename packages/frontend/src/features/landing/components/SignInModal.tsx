import { ArrowRight } from 'lucide-react';
import { useSignInState } from '../hooks';
import type { SignInState } from '../types';
import { FormField } from './FormField';
import { ModalHeader } from './ModalHeader';
import { PasswordInput } from './PasswordInput';
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
        <input
          type="email"
          autoFocus
          placeholder="you@example.com"
          className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${errors.email ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            clearError('email');
          }}
        />
      </FormField>
      <FormField label="Password" error={errors.password}>
        <PasswordInput
          value={password}
          placeholder="••••••••"
          show={showPw}
          onToggle={toggleShowPw}
          onChange={(value) => {
            setPassword(value);
            clearError('password');
          }}
          error={errors.password}
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
      className="px-8 py-7 space-y-4 text-slate-900"
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
      <p className="text-center text-sm text-slate-500 pt-1">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignUp}
          className="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <ModalHeader
          onClose={onClose}
          title="Welcome back"
          subtitle="Sign in to your Quro account"
        />
        <SignInForm state={state} onSwitchToSignUp={onSwitchToSignUp} />
      </div>
    </div>
  );
}
