import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/AuthContext';
import type { LandingErrorMap, SignUpFormValues, SignUpState } from '../types';
import { getAuthErrorMessage } from '../utils/auth-error';
import { validateSignUp } from '../utils/validation';

const initialForm: SignUpFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  currentAge: '',
  retirementAge: '',
  password: '',
  confirm: '',
};

export function useSignUpState(): SignUpState {
  const navigate = useNavigate();
  const { signUp } = useAuth();
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

    const validationErrors = validateSignUp(form);
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
      });
      void navigate('/');
    } catch (error: unknown) {
      setErrors({ email: getAuthErrorMessage(error, 'Sign up failed') });
    } finally {
      setLoading(false);
    }
  };

  return {
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
