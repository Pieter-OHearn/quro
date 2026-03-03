import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/AuthContext';
import type { LandingErrorMap, SignInState } from '../types';
import { getAuthErrorMessage } from '../utils/auth-error';
import { validateSignIn } from '../utils/validation';

export function useSignInState(): SignInState {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<LandingErrorMap>({});

  const clearError = (field: 'email' | 'password') => {
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const handleSubmit: SignInState['handleSubmit'] = async (event) => {
    event.preventDefault();

    const validationErrors = validateSignIn({ email, password });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      await signIn(email, password);
      void navigate('/');
    } catch (error: unknown) {
      setErrors({ email: getAuthErrorMessage(error, 'Sign in failed') });
    } finally {
      setLoading(false);
    }
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    showPw,
    toggleShowPw: () => setShowPw((current) => !current),
    loading,
    errors,
    clearError,
    handleSubmit,
  };
}
