import { CalendarDays, Sparkles, Target } from 'lucide-react';
import { FormField, Modal, PasswordInput, QuroLogo, TextInput } from '@/components/ui';
import { useSignUpState } from '../hooks';
import type { SignUpState } from '../types';
import { InviteCodeField, RegistrationClosedNotice } from './RegistrationNotices';
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

function NameFields({
  form,
  setField,
  errors,
  autoFocus,
}: Readonly<BaseSignUpFieldProps & { autoFocus: boolean }>) {
  return (
    <>
      <FormField label="First name" error={errors.firstName}>
        <TextInput
          type="text"
          autoFocus={autoFocus}
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
            <CalendarDays size={14} className="text-fg-faint" />
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
            <Target size={14} className="text-fg-faint" />
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
  const { policy, form, setField, errors } = state;
  const showCode = policy?.signUp !== 'open';
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {showCode ? (
        <InviteCodeField
          policy={policy}
          value={form.inviteCode}
          error={errors.inviteCode}
          onChange={(value) => setField('inviteCode', value)}
        />
      ) : null}
      <NameFields {...state} autoFocus={!showCode} />
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
      className="space-y-4 px-8 py-7 text-fg"
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
      <p className="pb-1 text-center text-sm text-fg-subtle">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="font-semibold text-brand transition-colors hover:text-brand-strong"
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
        className: 'bg-gradient-to-br from-surface-inverse to-surface-auth-end px-8 pb-10 pt-8',
        titleClassName: 'text-2xl font-black tracking-tight',
        subtitleClassName: 'mt-1 text-sm',
        closeIconSize: 16,
      }}
    >
      {state.policy?.signUp === 'closed' ? (
        <RegistrationClosedNotice onSwitchToSignIn={onSwitchToSignIn} />
      ) : (
        <SignUpForm state={state} onSwitchToSignIn={onSwitchToSignIn} />
      )}
    </Modal>
  );
}
