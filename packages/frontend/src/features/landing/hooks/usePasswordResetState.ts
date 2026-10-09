import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/AuthContext';
import type { LandingErrorMap, PasswordResetFormValues, PasswordResetState } from '../types';
import { getAuthErrorMessage } from '../utils/auth-error';
import { validatePasswordReset } from '../utils/validation';

const initialForm: PasswordResetFormValues = { code: '', nextPassword: '', confirm: '' };

export function usePasswordResetState(): PasswordResetState {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<LandingErrorMap>({});

  const setField = (field: keyof PasswordResetFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({
      ...current,
      [field]: '',
      ...(field === 'nextPassword' ? { confirm: '' } : {}),
    }));
  };

  const handleSubmit: PasswordResetState['handleSubmit'] = async (event) => {
    event.preventDefault();

    const validationErrors = validatePasswordReset(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ code: form.code.trim(), nextPassword: form.nextPassword });
      void navigate('/');
    } catch (error: unknown) {
      const message = getAuthErrorMessage(error, 'Password reset failed');
      setErrors(/code/i.test(message) ? { code: message } : { nextPassword: message });
    } finally {
      setLoading(false);
    }
  };

  return {
    form,
    setField,
    showPw,
    toggleShowPw: () => setShowPw((current) => !current),
    loading,
    errors,
    handleSubmit,
  };
}
