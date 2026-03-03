import { Sparkles } from 'lucide-react';
import { useSignUpState } from '../hooks';
import type { SignUpState } from '../types';
import { FormField } from './FormField';
import { ModalHeader } from './ModalHeader';
import { PasswordInput } from './PasswordInput';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { SubmitButton } from './SubmitButton';

type SignUpModalProps = {
  onClose: () => void;
  onSwitchToSignIn: () => void;
};

type SignUpFormProps = {
  state: SignUpState;
  onSwitchToSignIn: () => void;
};

function SignUpFormFields({ state }: Readonly<{ state: SignUpState }>) {
  const { form, setField, showPw, toggleShowPw, showConfirm, toggleShowConfirm, errors } = state;

  return (
    <>
      <FormField label="Full name" error={errors.name}>
        <input
          type="text"
          autoFocus
          placeholder="e.g. John Smith"
          className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${errors.name ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
          value={form.name}
          onChange={(event) => setField('name', event.target.value)}
        />
      </FormField>
      <FormField label="Email address" error={errors.email}>
        <input
          type="email"
          placeholder="you@example.com"
          className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${errors.email ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
          value={form.email}
          onChange={(event) => setField('email', event.target.value)}
        />
      </FormField>
      <FormField label="Password" error={errors.password}>
        <PasswordInput
          value={form.password}
          placeholder="Min. 8 characters"
          show={showPw}
          onToggle={toggleShowPw}
          onChange={(value) => setField('password', value)}
          error={errors.password}
        />
        <PasswordStrengthMeter password={form.password} />
      </FormField>
      <FormField label="Confirm password" error={errors.confirm}>
        <PasswordInput
          value={form.confirm}
          placeholder="Re-enter password"
          show={showConfirm}
          onToggle={toggleShowConfirm}
          onChange={(value) => setField('confirm', value)}
          error={errors.confirm}
        />
      </FormField>
    </>
  );
}

function SignUpForm({ state, onSwitchToSignIn }: Readonly<SignUpFormProps>) {
  const { loading, handleSubmit } = state;

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="px-8 py-7 space-y-4 overflow-y-auto text-slate-900"
    >
      <SignUpFormFields state={state} />
      <SubmitButton
        loading={loading}
        loadingText="Creating account…"
        idleContent={
          <>
            <Sparkles size={15} />
            <span>Create Free Account</span>
          </>
        }
      />
      <p className="text-center text-sm text-slate-500 pb-1">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}

export function SignUpModal({ onClose, onSwitchToSignIn }: Readonly<SignUpModalProps>) {
  const state = useSignUpState();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[95vh] flex flex-col">
        <ModalHeader
          onClose={onClose}
          title="Create your account"
          subtitle="Start tracking your finances for free"
        />
        <SignUpForm state={state} onSwitchToSignIn={onSwitchToSignIn} />
      </div>
    </div>
  );
}
