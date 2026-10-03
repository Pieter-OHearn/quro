/* eslint-disable complexity */
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ElementType } from 'react';
import type { UpdateUserProfileInput, User } from '@quro/shared';
import {
  MAX_RETIREMENT_AGE,
  MAX_USER_AGE,
  MIN_PASSWORD_LENGTH,
  MIN_RETIREMENT_AGE,
  MIN_USER_AGE,
} from '@quro/shared';
import { Check, Save } from 'lucide-react';
import { Button, TextInput } from '@/components/ui';
import { cn } from '@/lib/utils';

export const DEFAULT_ERROR_MESSAGE = 'Failed to save your changes';
export type StrengthState = {
  score: number;
  label: string;
  textClassName: string;
  barClassName: string;
};

export type SaveActionButtonProps = {
  saved: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export type ProfileFormState = {
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  retirementAge: string;
  location: string;
};

export type PasswordFormState = {
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
};

export type ProfileSectionProps = {
  user: User;
  replaceUser: (nextUser: User | null) => void;
  initials: string;
};

export type SecuritySectionProps = {
  user: User;
  replaceUser: (nextUser: User | null) => void;
};

export type PreferencesSectionProps = {
  user: User;
  replaceUser: (nextUser: User | null) => void;
};

export type IconTextInputProps = Omit<ComponentProps<typeof TextInput>, 'value' | 'onChange'> & {
  icon: ElementType;
  value: string;
  onChange: (value: string) => void;
};

export function toProfileFormState(user: User): ProfileFormState {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    age: String(user.age),
    retirementAge: String(user.retirementAge),
    location: user.location,
  };
}

export function createEmptyPasswordForm(): PasswordFormState {
  return {
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  };
}

export function formatPasswordChangedAt(value: string | null): string {
  if (!value) return 'Never changed';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recently updated';

  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function getPasswordStrength(password: string): StrengthState {
  if (!password) {
    return {
      score: 0,
      label: '',
      textClassName: 'text-fg-faint',
      barClassName: 'bg-border-default',
    };
  }

  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) {
    return {
      score,
      label: 'Weak',
      textClassName: 'text-danger',
      barClassName: 'bg-danger-muted',
    };
  }

  if (score === 2) {
    return {
      score,
      label: 'Fair',
      textClassName: 'text-warning-accent',
      barClassName: 'bg-warning-muted',
    };
  }

  if (score === 3) {
    return {
      score,
      label: 'Good',
      textClassName: 'text-info-accent',
      barClassName: 'bg-info-muted',
    };
  }

  return {
    score,
    label: 'Strong',
    textClassName: 'text-success-accent',
    barClassName: 'bg-success-muted',
  };
}

export function useSavedState(durationMs = 2400) {
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const showSaved = () => {
    setSaved(true);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setSaved(false);
      timeoutRef.current = null;
    }, durationMs);
  };

  return { saved, showSaved };
}

export function SectionHeader({ title, subtitle }: Readonly<{ title: string; subtitle: string }>) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-fg-deep">{title}</h3>
      <p className="mt-1 text-sm text-fg-subtle">{subtitle}</p>
    </div>
  );
}

export function SaveActionButton({
  saved,
  loading = false,
  disabled = false,
  onClick,
}: Readonly<SaveActionButtonProps>) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      leadingIcon={saved ? <Check size={14} /> : <Save size={14} />}
      className={cn(saved && 'bg-success-accent hover:bg-success-accent')}
    >
      {saved ? 'Saved' : 'Save changes'}
    </Button>
  );
}

export function IconTextInput({
  className,
  icon: Icon,
  value,
  onChange,
  ...props
}: Readonly<IconTextInputProps>) {
  return (
    <div className="relative">
      <Icon
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint"
      />
      <TextInput {...props} value={value} onChange={onChange} className={cn('pl-10', className)} />
    </div>
  );
}

export function parseWholeNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function buildProfilePayload(form: ProfileFormState) {
  const errors: Record<string, string> = {};
  const age = parseWholeNumber(form.age);
  const retirementAge = parseWholeNumber(form.retirementAge);

  if (!form.firstName.trim()) errors.firstName = 'First name is required';
  if (!form.lastName.trim()) errors.lastName = 'Last name is required';
  if (!form.email.trim()) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (age === null || age < MIN_USER_AGE || age > MAX_USER_AGE) {
    errors.age = `Age must be between ${MIN_USER_AGE} and ${MAX_USER_AGE}`;
  }

  const minRetirementAge =
    age === null ? MIN_RETIREMENT_AGE : Math.max(age + 1, MIN_RETIREMENT_AGE);
  if (retirementAge === null) {
    errors.retirementAge = 'Target retirement age is required';
  } else if (retirementAge < minRetirementAge || retirementAge > MAX_RETIREMENT_AGE) {
    errors.retirementAge = `Must be between ${minRetirementAge} and ${MAX_RETIREMENT_AGE}`;
  }

  if (Object.keys(errors).length > 0 || age === null || retirementAge === null) {
    return { errors, payload: null };
  }

  const payload: UpdateUserProfileInput = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim().toLowerCase(),
    location: form.location.trim(),
    age,
    retirementAge,
  };

  return { errors, payload };
}
