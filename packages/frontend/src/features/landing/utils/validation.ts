import type { LandingErrorMap, SignInFormValues, SignUpFormValues } from '../types';

const EMAIL_REGEX = /\S+@\S+\.\S+/;
const MIN_PASSWORD_LENGTH = 8;

export function validateSignIn(values: SignInFormValues): LandingErrorMap {
  const errors: LandingErrorMap = {};

  if (!values.email.trim()) {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(values.email)) {
    errors.email = 'Enter a valid email';
  }

  if (!values.password.trim()) {
    errors.password = 'Password is required';
  }

  return errors;
}

export function validateSignUp(values: SignUpFormValues): LandingErrorMap {
  const errors: LandingErrorMap = {};

  if (!values.name.trim()) {
    errors.name = 'Full name is required';
  }

  if (!values.email.trim()) {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(values.email)) {
    errors.email = 'Enter a valid email';
  }

  if (!values.password) {
    errors.password = 'Password is required';
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = 'At least 8 characters';
  }

  if (values.confirm !== values.password) {
    errors.confirm = "Passwords don't match";
  }

  return errors;
}
