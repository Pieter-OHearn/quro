import { CalendarDays, Sparkles, Target } from 'lucide-react';
import { FormField, Modal, PasswordInput, QuroLogo, TextInput } from '@/components/ui';
import { useSignUpState } from '../hooks';
import type { SignUpState } from '../types';
import { SubmitButton } from './SubmitButton';

type SignUpModalProps = {
  onClose: () => void;
  onSwitchToSignIn: () => void;
};

type SignUpFormProps = {
  state: SignUpState;
  onSwitchToSignIn: () => void;
};

type BaseSignUpFieldProps = Pick<SignUpState, 'form' | 'setField' | 'errors'>;

type SignUpPasswordFieldProps = BaseSignUpFieldProps &
  Pick<SignUpState, 'showPw' | 'toggleShowPw' | 'showConfirm' | 'toggleShowConfirm'>;

function normalizeDigits(value: string) {
  return value.replaceAll(/\D/g, '');
}

function NameFields({ form, setField, errors }: Readonly<BaseSignUpFieldProps>) {
  return (
    <>
      <FormField label="First name" error={errors.firstName}>
        <TextInput
          type="text"
          autoFocus
          autoComplete="given-name"
          placeholder="John"
          error={Boolean(errors.firstName)}
          value={form.firstName}
          onChange={(value) => setField('firstName', value)}
        />
      </FormField>
      <FormField label="Last name" error={errors.lastName}>
        <TextInput
          type="text"
          autoComplete="family-name"
          placeholder="Doe"
          error={Boolean(errors.lastName)}
          value={form.lastName}
          onChange={(value) => setField('lastName', value)}
        />
      </FormField>
    </>
  );
}

function EmailField({ form, setField, errors }: Readonly<BaseSignUpFieldProps>) {
  return (
    <FormField label="Email address" error={errors.email} className="sm:col-span-2">
      <TextInput
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={Boolean(errors.email)}
        value={form.email}
        onChange={(value) => setField('email', value)}
      />
    </FormField>
  );
}

function AgeFields({ form, setField, errors }: Readonly<BaseSignUpFieldProps>) {
  return (
    <>
      <FormField
        label={
          <span className="inline-flex items-center gap-2">
            <CalendarDays size={14} className="text-slate-400" />
            <span>Current age</span>
          </span>
        }
        error={errors.currentAge}
      >
        <TextInput
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={3}
          placeholder="e.g. 36"
          error={Boolean(errors.currentAge)}
          value={form.currentAge}
          onChange={(value) => setField('currentAge', normalizeDigits(value))}
        />
      </FormField>
      <FormField
        label={
          <span className="inline-flex items-center gap-2">
            <Target size={14} className="text-slate-400" />
            <span>Retirement age</span>
          </span>
        }
        error={errors.retirementAge}
      >
        <TextInput
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={3}
          placeholder="e.g. 65"
          error={Boolean(errors.retirementAge)}
          value={form.retirementAge}
          onChange={(value) => setField('retirementAge', normalizeDigits(value))}
        />
      </FormField>
    </>
  );
}

function PasswordFields({
  form,
  setField,
  errors,
  showPw,
  toggleShowPw,
  showConfirm,
  toggleShowConfirm,
}: Readonly<SignUpPasswordFieldProps>) {
  return (
    <>
      <FormField label="Password" error={errors.password} className="sm:col-span-2">
        <PasswordInput
          value={form.password}
          placeholder="Min. 8 characters"
          autoComplete="new-password"
          show={showPw}
          onToggle={toggleShowPw}
          onChange={(value) => setField('password', value)}
          error={Boolean(errors.password)}
        />
      </FormField>
      <FormField label="Confirm password" error={errors.confirm} className="sm:col-span-2">
        <PasswordInput
          value={form.confirm}
          placeholder="Re-enter password"
          autoComplete="new-password"
          show={showConfirm}
          onToggle={toggleShowConfirm}
          onChange={(value) => setField('confirm', value)}
          error={Boolean(errors.confirm)}
        />
      </FormField>
    </>
  );
}

function SignUpFormFields({ state }: Readonly<{ state: SignUpState }>) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <NameFields {...state} />
      <EmailField {...state} />
      <AgeFields {...state} />
      <PasswordFields {...state} />
    </div>
  );
}

function SignUpForm({ state, onSwitchToSignIn }: Readonly<SignUpFormProps>) {
  const { loading, handleSubmit } = state;

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="space-y-4 px-8 py-7 text-slate-900"
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
      <p className="pb-1 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
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
      scrollable
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
      <SignUpForm state={state} onSwitchToSignIn={onSwitchToSignIn} />
    </Modal>
  );
}
