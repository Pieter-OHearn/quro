/* eslint-disable complexity */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { UpdateUserProfileInput, User } from '@quro/shared';
import {
  MAX_RETIREMENT_AGE,
  MAX_USER_AGE,
  MIN_PASSWORD_LENGTH,
  MIN_RETIREMENT_AGE,
  MIN_USER_AGE,
} from '@quro/shared';
import { Check, Save } from 'lucide-react';
import { Button, Card, PanelHeader } from '@/components/ui';
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
};

export type SecuritySectionProps = {
  user: User;
  replaceUser: (nextUser: User | null) => void;
};

export type PreferencesSectionProps = {
  user: User;
  replaceUser: (nextUser: User | null) => void;
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
      textClassName: 'text-fg-subtle',
      barClassName: 'bg-surface-muted',
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
      barClassName: 'bg-danger',
    };
  }

  if (score === 2) {
    return {
      score,
      label: 'Fair',
      textClassName: 'text-warning',
      barClassName: 'bg-warning',
    };
  }

  if (score === 3) {
    return {
      score,
      label: 'Good',
      textClassName: 'text-info',
      barClassName: 'bg-info',
    };
  }

  return {
    score,
    label: 'Strong',
    textClassName: 'text-success',
    barClassName: 'bg-success',
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

type SettingsCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Shown under the content, aligned to the end, such as the save button. */
  footer?: ReactNode;
  /** Drops the body padding for content that runs to the card edges, such as a list of rows. */
  flush?: boolean;
  children: ReactNode;
};

/** One settings section: a plain card with a card header, 16px padding and an optional footer. */
export function SettingsCard({
  title,
  subtitle,
  action,
  footer,
  flush = false,
  children,
}: Readonly<SettingsCardProps>) {
  return (
    <Card padding="none">
      <PanelHeader title={title} subtitle={subtitle} action={action} />
      <div className={flush ? undefined : 'space-y-4 p-4'}>{children}</div>
      {footer ? (
        <div className="flex justify-end border-t border-border-default px-4 py-3">{footer}</div>
      ) : null}
    </Card>
  );
}

/** A request failure under a form. */
export function FormErrorNotice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p
      role="alert"
      className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-cell text-danger"
    >
      {children}
    </p>
  );
}

type ChoiceButtonProps = {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
};

/** One option of a choice group: a bordered row whose selection is a `brand-soft` tint. */
export function ChoiceButton({ selected, onSelect, children }: Readonly<ChoiceButtonProps>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-fast',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
        selected
          ? 'border-brand bg-brand-soft text-brand-fg'
          : 'border-border-default bg-surface text-fg hover:bg-surface-muted active:bg-surface-muted',
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {selected ? <Check size={16} className="shrink-0 text-brand" aria-hidden="true" /> : null}
    </button>
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
    >
      {saved ? 'Saved' : 'Save changes'}
    </Button>
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
