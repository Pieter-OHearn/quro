import {
  MAX_RETIREMENT_AGE,
  MAX_USER_AGE,
  MIN_PASSWORD_LENGTH,
  MIN_RETIREMENT_AGE,
  MIN_USER_AGE,
} from '@quro/shared';
import type { LandingErrorMap, SignInFormValues, SignUpFormValues } from '../types';

const EMAIL_REGEX = /\S+@\S+\.\S+/;

function parseAge(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const age = Number(normalized);
  return Number.isInteger(age) ? age : null;
}

function setError(errors: LandingErrorMap, field: keyof SignUpFormValues, error: string | null) {
  if (error) {
    errors[field] = error;
  }
}

function getRequiredFieldError(value: string, label: string) {
  return value.trim() ? null : `${label} is required`;
}

function getEmailError(value: string) {
  if (!value.trim()) {
    return 'Email is required';
  }

  return EMAIL_REGEX.test(value) ? null : 'Enter a valid email';
}

function getCurrentAgeError(age: number | null) {
  if (age === null) {
    return 'Enter your age';
  }

  return age < MIN_USER_AGE || age > MAX_USER_AGE
    ? `Age must be between ${MIN_USER_AGE} and ${MAX_USER_AGE}`
    : null;
}

function getRetirementAgeError(retirementAge: number | null, currentAge: number | null) {
  if (retirementAge === null) {
    return 'Enter your retirement age';
  }

  if (retirementAge < MIN_RETIREMENT_AGE || retirementAge > MAX_RETIREMENT_AGE) {
    return `Retirement age must be between ${MIN_RETIREMENT_AGE} and ${MAX_RETIREMENT_AGE}`;
  }

  return currentAge !== null && retirementAge <= currentAge
    ? 'Retirement age must be higher'
    : null;
}

function getPasswordError(password: string) {
  if (!password) {
    return 'Password is required';
  }

  return password.length < MIN_PASSWORD_LENGTH
    ? `At least ${MIN_PASSWORD_LENGTH} characters`
    : null;
}

function getConfirmPasswordError(confirm: string, password: string) {
  if (!confirm) {
    return 'Please confirm your password';
  }

  return confirm !== password ? "Passwords don't match" : null;
}

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
  const currentAge = parseAge(values.currentAge);
  const retirementAge = parseAge(values.retirementAge);

  setError(errors, 'firstName', getRequiredFieldError(values.firstName, 'First name'));
  setError(errors, 'lastName', getRequiredFieldError(values.lastName, 'Last name'));
  setError(errors, 'email', getEmailError(values.email));
  setError(errors, 'currentAge', getCurrentAgeError(currentAge));
  setError(errors, 'retirementAge', getRetirementAgeError(retirementAge, currentAge));
  setError(errors, 'password', getPasswordError(values.password));
  setError(errors, 'confirm', getConfirmPasswordError(values.confirm, values.password));

  return errors;
}
