import type { LandingErrorMap, SignInFormValues, SignUpFormValues } from '../types';

const EMAIL_REGEX = /\S+@\S+\.\S+/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_AGE = 18;
const MAX_AGE = 100;

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

  return age < MIN_AGE || age > MAX_AGE ? `Age must be between ${MIN_AGE} and ${MAX_AGE}` : null;
}

function getRetirementAgeError(retirementAge: number | null, currentAge: number | null) {
  if (retirementAge === null) {
    return 'Enter your retirement age';
  }

  if (retirementAge < MIN_AGE || retirementAge > MAX_AGE) {
    return `Age must be between ${MIN_AGE} and ${MAX_AGE}`;
  }

  return currentAge !== null && retirementAge <= currentAge
    ? 'Retirement age must be higher'
    : null;
}

function getPasswordError(password: string) {
  if (!password) {
    return 'Password is required';
  }

  return password.length < MIN_PASSWORD_LENGTH ? 'At least 8 characters' : null;
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
