import { ArrowRight } from 'lucide-react';
import { FormField, Modal, ModalHeader, PasswordInput, QuroLogo, TextInput } from '@/components/ui';
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
          placeholder="you@example.com"
          className="px-4 py-3 transition-all"
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
          show={showPw}
          onToggle={toggleShowPw}
          className="px-4 py-3 transition-all"
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
    <Modal
      title="Welcome back"
      subtitle="Sign in to your Quro account"
      onClose={onClose}
      maxWidth="md"
      backdropClassName="bg-black/60 backdrop-blur-sm"
      contentClassName="rounded-3xl"
      bodyClassName="p-0 space-y-0"
      header={
        <ModalHeader
          onClose={onClose}
          title="Welcome back"
          subtitle="Sign in to your Quro account"
          align="center"
          visual={
            <div className="flex justify-center mb-4">
              <QuroLogo size={52} showBg={false} />
            </div>
          }
          className="bg-gradient-to-br from-[#0a0f1e] to-[#1a2550] px-8 pt-8 pb-10"
          titleClassName="text-2xl font-black tracking-tight"
          subtitleClassName="text-sm mt-1"
          closeIconSize={16}
        />
      }
    >
      <SignInForm state={state} onSwitchToSignUp={onSwitchToSignUp} />
    </Modal>
  );
}
