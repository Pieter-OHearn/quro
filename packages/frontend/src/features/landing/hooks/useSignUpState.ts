import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/AuthContext';
import type { LandingErrorMap, SignUpFormValues, SignUpState } from '../types';
import { getAuthErrorMessage } from '../utils/auth-error';
import { validateSignUp } from '../utils/validation';
import { useRegistrationPolicy } from './useRegistrationPolicy';

const initialForm: SignUpFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  currentAge: '',
  retirementAge: '',
  password: '',
  confirm: '',
  inviteCode: '',
};

// Code problems belong next to the code field; everything else is about the account details.
function errorField(message: string): keyof SignUpFormValues {
  return /\bcode\b|registration is closed/i.test(message) ? 'inviteCode' : 'email';
}

export function useSignUpState(): SignUpState {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { data: policy } = useRegistrationPolicy();
  const [form, setForm] = useState(initialForm);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<LandingErrorMap>({});

  const setField = (field: keyof SignUpFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({
      ...current,
      [field]: '',
      ...(field === 'password' ? { confirm: '' } : {}),
      ...(field === 'currentAge' ? { retirementAge: '' } : {}),
    }));
  };

  const handleSubmit: SignUpState['handleSubmit'] = async (event) => {
    event.preventDefault();

    const validationErrors = validateSignUp(form, { requireCode: policy?.signUp === 'code' });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      await signUp({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email,
        password: form.password,
        age: Number(form.currentAge),
        retirementAge: Number(form.retirementAge),
        inviteCode: form.inviteCode.trim() || undefined,
      });
      void navigate('/');
    } catch (error: unknown) {
      const message = getAuthErrorMessage(error, 'Sign up failed');
      setErrors({ [errorField(message)]: message });
    } finally {
      setLoading(false);
    }
  };

  return {
    policy,
    form,
    setField,
    showPw,
    toggleShowPw: () => setShowPw((current) => !current),
    showConfirm,
    toggleShowConfirm: () => setShowConfirm((current) => !current),
    loading,
    errors,
    handleSubmit,
  };
}
