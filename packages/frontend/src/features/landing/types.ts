import type { FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

export type ModalType = 'signin' | 'signup' | null;

export type LandingErrorMap = Record<string, string>;

export type SignInFormValues = {
  email: string;
  password: string;
};

export type SignUpFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  currentAge: string;
  retirementAge: string;
  password: string;
  confirm: string;
};

export type SignInState = {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPw: boolean;
  toggleShowPw: () => void;
  loading: boolean;
  errors: LandingErrorMap;
  clearError: (field: keyof SignInFormValues) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export type SignUpState = {
  form: SignUpFormValues;
  setField: (field: keyof SignUpFormValues, value: string) => void;
  showPw: boolean;
  toggleShowPw: () => void;
  showConfirm: boolean;
  toggleShowConfirm: () => void;
  loading: boolean;
  errors: LandingErrorMap;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export type PasswordStrength = {
  score: number;
  label: string;
  color: string;
  textColor: string;
};

export type LandingPreviewBar = {
  id: string;
  height: number;
};

export type LandingPreviewStat = {
  label: string;
  value: string;
  color: string;
};

export type LandingFeature = {
  icon: LucideIcon;
  label: string;
  desc: string;
  color: string;
  border: string;
};

export type LandingNavLink = {
  id: string;
  label: string;
};

export type LandingTrustBadge = {
  icon: LucideIcon;
  text: string;
};

export type LandingHowItWorksStep = {
  step: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  color: string;
};

export type LandingPillar = {
  icon: LucideIcon;
  title: string;
  desc: string;
  color: string;
};
