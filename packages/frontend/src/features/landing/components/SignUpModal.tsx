import { Sparkles } from 'lucide-react';
import { FormField, Modal, ModalHeader, PasswordInput, QuroLogo, TextInput } from '@/components/ui';
import { useSignUpState } from '../hooks';
import type { SignUpState } from '../types';
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
        <TextInput
          type="text"
          autoFocus
          placeholder="e.g. John Smith"
          className="px-4 py-3 transition-all"
          error={Boolean(errors.name)}
          value={form.name}
          onChange={(value) => setField('name', value)}
        />
      </FormField>
      <FormField label="Email address" error={errors.email}>
        <TextInput
          type="email"
          placeholder="you@example.com"
          className="px-4 py-3 transition-all"
          error={Boolean(errors.email)}
          value={form.email}
          onChange={(value) => setField('email', value)}
        />
      </FormField>
      <FormField label="Password" error={errors.password}>
        <PasswordInput
          value={form.password}
          placeholder="Min. 8 characters"
          show={showPw}
          onToggle={toggleShowPw}
          className="px-4 py-3 transition-all"
          onChange={(value) => setField('password', value)}
          error={Boolean(errors.password)}
        />
        <PasswordStrengthMeter password={form.password} />
      </FormField>
      <FormField label="Confirm password" error={errors.confirm}>
        <PasswordInput
          value={form.confirm}
          placeholder="Re-enter password"
          show={showConfirm}
          onToggle={toggleShowConfirm}
          className="px-4 py-3 transition-all"
          onChange={(value) => setField('confirm', value)}
          error={Boolean(errors.confirm)}
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
      className="px-8 py-7 space-y-4 text-slate-900"
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
    <Modal
      title="Create your account"
      subtitle="Start tracking your finances for free"
      onClose={onClose}
      maxWidth="md"
      scrollable
      backdropClassName="bg-black/60 backdrop-blur-sm"
      contentClassName="rounded-3xl max-h-[95vh]"
      bodyClassName="p-0 space-y-0"
      header={
        <ModalHeader
          onClose={onClose}
          title="Create your account"
          subtitle="Start tracking your finances for free"
          align="center"
          scrollable
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
      <SignUpForm state={state} onSwitchToSignIn={onSwitchToSignIn} />
    </Modal>
  );
}
