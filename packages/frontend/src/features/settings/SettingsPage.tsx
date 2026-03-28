/* eslint-disable complexity, max-lines-per-function */
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ElementType } from 'react';
import { useSearchParams } from 'react-router';
import type {
  CurrencyCode,
  NumberFormatPreference,
  UpdateUserPasswordInput,
  UpdateUserPreferencesInput,
  UpdateUserProfileInput,
  User,
} from '@quro/shared';
import { formatNumber, NUMBER_FORMATS } from '@quro/shared';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  Lock,
  Mail,
  MapPin,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  User as UserIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ContentSection,
  FormField,
  PageStack,
  PasswordInput,
  TextInput,
} from '@/components/ui';
import { CURRENCY_CODES, CURRENCY_META } from '@/lib/CurrencyContext';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { resolveApiErrorMessage } from '@/lib/pdfDocuments';
import { getUserDisplayName, getUserInitials } from '@/lib/user';
import { cn } from '@/lib/utils';

type TabKey = 'profile' | 'security' | 'preferences';

type StrengthState = {
  score: number;
  label: string;
  textClassName: string;
  barClassName: string;
};

type SaveActionButtonProps = {
  saved: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type ProfileFormState = {
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  retirementAge: string;
  location: string;
};

type PasswordFormState = {
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
};

type ProfileSectionProps = {
  user: User;
  replaceUser: (nextUser: User | null) => void;
  initials: string;
};

type SecuritySectionProps = {
  user: User;
  replaceUser: (nextUser: User | null) => void;
};

type PreferencesSectionProps = {
  user: User;
  replaceUser: (nextUser: User | null) => void;
};

type IconTextInputProps = Omit<ComponentProps<typeof TextInput>, 'value' | 'onChange'> & {
  icon: ElementType;
  value: string;
  onChange: (value: string) => void;
};

const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: ElementType; subtitle: string }> = [
  { key: 'profile', label: 'Profile', icon: UserIcon, subtitle: 'Name, age, and location' },
  { key: 'security', label: 'Security', icon: Lock, subtitle: 'Password management' },
  {
    key: 'preferences',
    label: 'Preferences',
    icon: SlidersHorizontal,
    subtitle: 'Currency and display defaults',
  },
];

const DEFAULT_ERROR_MESSAGE = 'Failed to save your changes';
const DEFAULT_TAB: TabKey = 'profile';

function resolveActiveTab(value: string | null): TabKey {
  const candidate = TABS.find((tab) => tab.key === value);
  return candidate?.key ?? DEFAULT_TAB;
}

function toProfileFormState(user: User): ProfileFormState {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    age: String(user.age),
    retirementAge: String(user.retirementAge),
    location: user.location,
  };
}

function createEmptyPasswordForm(): PasswordFormState {
  return {
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  };
}

function formatPasswordChangedAt(value: string | null): string {
  if (!value) return 'Never changed';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recently updated';

  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getPasswordStrength(password: string): StrengthState {
  if (!password) {
    return {
      score: 0,
      label: '',
      textClassName: 'text-slate-400',
      barClassName: 'bg-slate-200',
    };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) {
    return {
      score,
      label: 'Weak',
      textClassName: 'text-rose-500',
      barClassName: 'bg-rose-400',
    };
  }

  if (score === 2) {
    return {
      score,
      label: 'Fair',
      textClassName: 'text-amber-500',
      barClassName: 'bg-amber-400',
    };
  }

  if (score === 3) {
    return {
      score,
      label: 'Good',
      textClassName: 'text-sky-500',
      barClassName: 'bg-sky-400',
    };
  }

  return {
    score,
    label: 'Strong',
    textClassName: 'text-emerald-500',
    barClassName: 'bg-emerald-400',
  };
}

function useSavedState(durationMs = 2400) {
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

function SectionHeader({ title, subtitle }: Readonly<{ title: string; subtitle: string }>) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function SaveActionButton({
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
      className={cn(saved && 'bg-emerald-500 hover:bg-emerald-500')}
    >
      {saved ? 'Saved' : 'Save changes'}
    </Button>
  );
}

function IconTextInput({
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
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <TextInput {...props} value={value} onChange={onChange} className={cn('pl-10', className)} />
    </div>
  );
}

function parseWholeNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function buildProfilePayload(form: ProfileFormState) {
  const errors: Record<string, string> = {};
  const age = parseWholeNumber(form.age);
  const retirementAge = parseWholeNumber(form.retirementAge);

  if (!form.firstName.trim()) errors.firstName = 'First name is required';
  if (!form.lastName.trim()) errors.lastName = 'Last name is required';
  if (!form.email.trim()) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (age === null || age < 16 || age > 100) errors.age = 'Age must be between 16 and 100';
  if (retirementAge === null) {
    errors.retirementAge = 'Target retirement age is required';
  } else if (age !== null && (retirementAge <= age || retirementAge > 80)) {
    errors.retirementAge = `Must be between ${age + 1} and 80`;
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

function ProfileSection({ user, replaceUser, initials }: Readonly<ProfileSectionProps>) {
  const [form, setForm] = useState<ProfileFormState>(() => toProfileFormState(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { saved, showSaved } = useSavedState();

  useEffect(() => {
    setForm(toProfileFormState(user));
  }, [user]);

  const yearsAway = (() => {
    const age = parseWholeNumber(form.age);
    const retirementAge = parseWholeNumber(form.retirementAge);
    if (age === null || retirementAge === null || retirementAge <= age) return 0;
    return retirementAge - age;
  })();

  const careerStartAge = 18;
  const currentAge = parseWholeNumber(form.age) ?? user.age;
  const targetRetirementAge = parseWholeNumber(form.retirementAge) ?? user.retirementAge;
  const totalCareerYears = Math.max(1, targetRetirementAge - careerStartAge);
  const careerYearsElapsed = Math.max(0, currentAge - careerStartAge);
  const elapsedPercent = Math.min(100, Math.round((careerYearsElapsed / totalCareerYears) * 100));
  const remainingPercent = Math.max(0, 100 - elapsedPercent);

  const handleSave = async () => {
    const nextState = buildProfilePayload(form);
    setErrors(nextState.errors);
    setFormError('');

    if (!nextState.payload) return;

    setIsSaving(true);
    try {
      const response = await api.put('/api/settings/profile', nextState.payload);
      replaceUser(response.data.data);
      showSaved();
    } catch (error) {
      setFormError(resolveApiErrorMessage(error, DEFAULT_ERROR_MESSAGE));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Profile"
        subtitle="How Quro identifies you and personalises your planning assumptions."
      />

      <div className="mb-6 flex items-center gap-5 rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-xl font-bold text-white shadow-lg shadow-indigo-200">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">
            {getUserDisplayName(user)}
          </p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <div className="mt-2">
            <Badge tone="brand" size="md">
              <ShieldCheck size={12} />
              Secure account
            </Badge>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <FormField label="First name" required error={errors.firstName}>
          <TextInput
            placeholder="John"
            value={form.firstName}
            error={Boolean(errors.firstName)}
            onChange={(value) => {
              setForm((current) => ({ ...current, firstName: value }));
              setErrors((current) => ({ ...current, firstName: '' }));
            }}
          />
        </FormField>
        <FormField label="Last name" required error={errors.lastName}>
          <TextInput
            placeholder="Doe"
            value={form.lastName}
            error={Boolean(errors.lastName)}
            onChange={(value) => {
              setForm((current) => ({ ...current, lastName: value }));
              setErrors((current) => ({ ...current, lastName: '' }));
            }}
          />
        </FormField>
      </div>

      <div className="mb-4">
        <FormField label="Email address" required error={errors.email}>
          <IconTextInput
            icon={Mail}
            type="email"
            placeholder="you@example.com"
            value={form.email}
            error={Boolean(errors.email)}
            onChange={(value) => {
              setForm((current) => ({ ...current, email: value }));
              setErrors((current) => ({ ...current, email: '' }));
            }}
          />
        </FormField>
      </div>

      <div className="mb-3 grid gap-4 sm:grid-cols-2">
        <FormField
          label="Current age"
          hint="Used for pension projections"
          required
          error={errors.age}
        >
          <IconTextInput
            icon={Calendar}
            type="number"
            inputMode="numeric"
            min={16}
            max={100}
            value={form.age}
            error={Boolean(errors.age)}
            onChange={(value) => {
              setForm((current) => ({ ...current, age: value }));
              setErrors((current) => ({ ...current, age: '' }));
            }}
          />
        </FormField>
        <FormField label="Target retirement age" required error={errors.retirementAge}>
          <IconTextInput
            icon={Target}
            type="number"
            inputMode="numeric"
            min={17}
            max={80}
            value={form.retirementAge}
            error={Boolean(errors.retirementAge)}
            onChange={(value) => {
              setForm((current) => ({ ...current, retirementAge: value }));
              setErrors((current) => ({ ...current, retirementAge: '' }));
            }}
          />
        </FormField>
      </div>

      {yearsAway > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl bg-slate-950 px-4 py-4 text-center">
            <p className="text-3xl font-semibold text-white">{yearsAway}</p>
            <p className="mt-1 text-xs text-slate-400">Years remaining to retirement</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
            <p className="text-3xl font-semibold text-slate-950">{elapsedPercent}%</p>
            <p className="mt-1 text-xs text-slate-500">Career timeline already elapsed</p>
          </div>
          <div className="rounded-3xl bg-indigo-600 px-4 py-4 text-center">
            <p className="text-3xl font-semibold text-white">{remainingPercent}%</p>
            <p className="mt-1 text-xs text-indigo-100">Runway left to keep contributing</p>
          </div>
        </div>
      ) : null}

      <div className="mb-8">
        <FormField label="Location">
          <IconTextInput
            icon={MapPin}
            placeholder="Amsterdam, Netherlands"
            value={form.location}
            onChange={(value) => {
              setForm((current) => ({ ...current, location: value }));
            }}
          />
        </FormField>
      </div>

      {formError ? (
        <p className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <SaveActionButton
          saved={saved}
          loading={isSaving}
          onClick={() => {
            void handleSave();
          }}
        />
      </div>
    </div>
  );
}

function SecuritySection({ user, replaceUser }: Readonly<SecuritySectionProps>) {
  const [form, setForm] = useState<PasswordFormState>(() => createEmptyPasswordForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { saved, showSaved } = useSavedState();

  const strength = getPasswordStrength(form.nextPassword);

  const handleSave = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.currentPassword) nextErrors.currentPassword = 'Enter your current password';
    if (form.nextPassword.length < 8) nextErrors.nextPassword = 'Must be at least 8 characters';
    if (form.nextPassword !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length > 0) return;

    const payload: UpdateUserPasswordInput = {
      currentPassword: form.currentPassword,
      nextPassword: form.nextPassword,
    };

    setIsSaving(true);
    try {
      const response = await api.put('/api/settings/password', payload);
      replaceUser(response.data.data);
      setForm(createEmptyPasswordForm());
      showSaved();
    } catch (error) {
      const message = resolveApiErrorMessage(error, DEFAULT_ERROR_MESSAGE);
      if (message === 'Current password is incorrect') {
        setErrors((current) => ({ ...current, currentPassword: message }));
      } else {
        setFormError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Security"
        subtitle="Change your password and keep your account credentials current."
      />

      <div className="mb-6 flex items-center gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50">
          <ShieldCheck size={18} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Password protected</p>
          <p className="text-xs text-slate-500">
            Last changed: {formatPasswordChangedAt(user.passwordUpdatedAt)}
          </p>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        <FormField label="Current password" required error={errors.currentPassword}>
          <PasswordInput
            placeholder="Enter current password"
            value={form.currentPassword}
            show={showCurrentPassword}
            error={Boolean(errors.currentPassword)}
            onChange={(value) => {
              setForm((current) => ({ ...current, currentPassword: value }));
              setErrors((current) => ({ ...current, currentPassword: '' }));
            }}
            onToggle={() => setShowCurrentPassword((current) => !current)}
          />
        </FormField>

        <FormField label="New password" required error={errors.nextPassword}>
          <PasswordInput
            placeholder="Minimum 8 characters"
            value={form.nextPassword}
            show={showNextPassword}
            error={Boolean(errors.nextPassword)}
            onChange={(value) => {
              setForm((current) => ({ ...current, nextPassword: value }));
              setErrors((current) => ({ ...current, nextPassword: '' }));
            }}
            onToggle={() => setShowNextPassword((current) => !current)}
          />
          {form.nextPassword ? (
            <div className="mt-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((index) => (
                  <div
                    key={index}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors',
                      index <= strength.score ? strength.barClassName : 'bg-slate-200',
                    )}
                  />
                ))}
                <span className={cn('ml-2 text-xs font-semibold', strength.textClassName)}>
                  {strength.label}
                </span>
              </div>
              <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
                {[
                  { label: '8+ characters', valid: form.nextPassword.length >= 8 },
                  { label: 'Uppercase letter', valid: /[A-Z]/.test(form.nextPassword) },
                  { label: 'Number', valid: /[0-9]/.test(form.nextPassword) },
                  { label: 'Symbol', valid: /[^A-Za-z0-9]/.test(form.nextPassword) },
                ].map((item) => (
                  <p
                    key={item.label}
                    className={cn(
                      'flex items-center gap-1.5',
                      item.valid ? 'text-emerald-600' : 'text-slate-400',
                    )}
                  >
                    <Check size={12} className={item.valid ? 'opacity-100' : 'opacity-0'} />
                    {item.label}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </FormField>

        <FormField label="Confirm new password" required error={errors.confirmPassword}>
          <PasswordInput
            placeholder="Re-enter new password"
            value={form.confirmPassword}
            show={showConfirmPassword}
            error={Boolean(errors.confirmPassword)}
            onChange={(value) => {
              setForm((current) => ({ ...current, confirmPassword: value }));
              setErrors((current) => ({ ...current, confirmPassword: '' }));
            }}
            onToggle={() => setShowConfirmPassword((current) => !current)}
          />
          {form.confirmPassword && form.confirmPassword === form.nextPassword ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <Check size={12} />
              Passwords match
            </p>
          ) : null}
        </FormField>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          Use a password you are not reusing anywhere else. Quro stores password hashes, not raw
          passwords.
        </p>
      </div>

      {formError ? (
        <p className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <SaveActionButton
          saved={saved}
          loading={isSaving}
          onClick={() => {
            void handleSave();
          }}
        />
      </div>
    </div>
  );
}

function PreferencesSection({ user, replaceUser }: Readonly<PreferencesSectionProps>) {
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(user.baseCurrency);
  const [selectedNumberFormat, setSelectedNumberFormat] = useState<NumberFormatPreference>(
    user.numberFormat,
  );
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { saved, showSaved } = useSavedState();
  const hasChanges =
    selectedCurrency !== user.baseCurrency || selectedNumberFormat !== user.numberFormat;

  useEffect(() => {
    setSelectedCurrency(user.baseCurrency);
    setSelectedNumberFormat(user.numberFormat);
  }, [user.baseCurrency, user.numberFormat]);

  const handleSave = async () => {
    const payload: UpdateUserPreferencesInput = {
      baseCurrency: selectedCurrency,
      numberFormat: selectedNumberFormat,
    };

    setIsSaving(true);
    setFormError('');
    try {
      const response = await api.put('/api/settings/preferences', payload);
      replaceUser(response.data.data);
      showSaved();
    } catch (error) {
      setFormError(resolveApiErrorMessage(error, DEFAULT_ERROR_MESSAGE));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Preferences"
        subtitle="Choose the app-wide defaults that drive balances, charts, and totals."
      />

      <div className="mb-8">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <SlidersHorizontal size={14} className="text-indigo-500" />
          Base Currency
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CURRENCY_CODES.map((code) => {
            const currency = CURRENCY_META[code];
            const isSelected = code === selectedCurrency;

            return (
              <button
                key={code}
                type="button"
                onClick={() => setSelectedCurrency(code)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all',
                  isSelected
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-slate-50',
                )}
              >
                <span className="text-2xl leading-none">{currency.flag}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{code}</p>
                  <p className="text-xs text-slate-400">{currency.name}</p>
                </div>
                {isSelected ? <Check size={16} className="ml-auto text-indigo-600" /> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Cross-currency balances and charts convert into this currency across the app.
        </p>
      </div>

      <div className="mb-8 border-t border-slate-100 pt-6">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <SlidersHorizontal size={14} className="text-indigo-500" />
          Number Format
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {NUMBER_FORMATS.map((numberFormat) => {
            const isSelected = numberFormat === selectedNumberFormat;
            const sample = formatNumber(1000, numberFormat, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });

            return (
              <button
                key={numberFormat}
                type="button"
                onClick={() => setSelectedNumberFormat(numberFormat)}
                className={cn(
                  'rounded-2xl border px-4 py-4 text-left transition-all',
                  isSelected
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-slate-50',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {numberFormat === 'en-US' ? '1,000.00 style' : '1.000,00 style'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Example: <span className="font-semibold text-slate-600">{sample}</span>
                    </p>
                  </div>
                  {isSelected ? <Check size={16} className="ml-auto text-indigo-600" /> : null}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Controls decimal and thousands separators anywhere Quro formats amounts.
        </p>
      </div>

      <div className="mb-8 border-t border-slate-100 pt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Coming Soon
        </p>
        <div className="space-y-2">
          {[
            'Dark mode',
            'Email and push notifications',
            'Two-factor authentication',
            'CSV and PDF export packs',
          ].map((item) => (
            <div
              key={item}
              className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <span className="text-sm text-slate-500">{item}</span>
              <Badge tone="muted">Soon</Badge>
            </div>
          ))}
        </div>
      </div>

      {formError ? (
        <p className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <SaveActionButton
          saved={saved}
          loading={isSaving}
          disabled={!hasChanges}
          onClick={() => {
            void handleSave();
          }}
        />
      </div>
    </div>
  );
}

export function Settings() {
  const { user, replaceUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveActiveTab(searchParams.get('tab'));
  const appVersion = __APP_VERSION__;

  const setActiveTab = (nextTab: TabKey): void => {
    setSearchParams({ tab: nextTab });
  };

  if (!user) return null;

  const initials = getUserInitials(user);
  const fullName = getUserDisplayName(user);
  const activeTabConfig = TABS.find((tab) => tab.key === activeTab) ?? TABS[0]!;

  return (
    <PageStack className="mx-auto max-w-6xl">
      <ContentSection>
        <Card
          padding="none"
          className="overflow-hidden border-0 bg-gradient-to-r from-[#0a0f1e] via-[#172038] to-[#0f3b5f] text-white shadow-xl shadow-slate-300/40"
        >
          <div className="relative overflow-hidden px-6 py-7 lg:px-8">
            <div className="absolute right-0 top-0 h-56 w-56 -translate-y-1/3 translate-x-1/5 rounded-full bg-white/8 blur-3xl" />
            <div className="absolute bottom-0 left-24 h-40 w-40 translate-y-1/2 rounded-full bg-sky-400/10 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-400 to-sky-500 text-xl font-bold text-white shadow-lg shadow-black/20">
                  {initials}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
                    Account Settings
                  </p>
                  <h2 className="mt-1 text-3xl font-semibold tracking-tight">{fullName}</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {user.email} · Age {user.age} · {user.location || 'Location not set'}
                  </p>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 backdrop-blur">
                <p className="font-medium text-white">{activeTabConfig.label}</p>
                <p className="mt-1 text-xs text-slate-300">{activeTabConfig.subtitle}</p>
              </div>
            </div>
          </div>
        </Card>
      </ContentSection>

      <ContentSection>
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="lg:w-64 lg:flex-shrink-0">
            <nav className="hidden lg:flex lg:flex-col lg:gap-2 lg:sticky lg:top-6">
              {TABS.map(({ key, label, icon: Icon, subtitle }) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-3xl border px-4 py-4 text-left transition-all',
                      isActive
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-200'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-2xl',
                        isActive ? 'bg-white/15' : 'bg-slate-100',
                      )}
                    >
                      <Icon size={16} className={isActive ? 'text-white' : 'text-slate-500'} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{label}</p>
                      <p
                        className={cn(
                          'truncate text-xs',
                          isActive ? 'text-indigo-100' : 'text-slate-400',
                        )}
                      >
                        {subtitle}
                      </p>
                    </div>
                    {isActive ? <ChevronRight size={16} className="ml-auto text-white/70" /> : null}
                  </button>
                );
              })}

              <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-400">
                  App Version
                </p>
                <p className="font-mono text-sm font-semibold text-slate-700">{appVersion}</p>
              </div>
            </nav>

            <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex flex-shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-colors',
                    activeTab === key
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600',
                  )}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Card className="flex-1 p-6 lg:p-8">
            {activeTab === 'profile' ? (
              <ProfileSection user={user} replaceUser={replaceUser} initials={initials} />
            ) : null}
            {activeTab === 'security' ? (
              <SecuritySection user={user} replaceUser={replaceUser} />
            ) : null}
            {activeTab === 'preferences' ? (
              <PreferencesSection user={user} replaceUser={replaceUser} />
            ) : null}
          </Card>
        </div>
      </ContentSection>
    </PageStack>
  );
}
