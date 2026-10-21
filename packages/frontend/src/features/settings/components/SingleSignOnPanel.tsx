import { useState } from 'react';
import { Button, Card, FormField, PanelHeader, PasswordInput } from '@/components/ui';
import { resolveApiErrorMessage } from '@/lib/api';
import { useSingleSignOnLink, useUnlinkSingleSignOn } from '../hooks';

type ViewProps = {
  providerName: string;
  /** False when the operator turned passwords off: there is no password to unlink with. */
  passwordLogin?: boolean;
  asking: boolean;
  password: string;
  showPassword: boolean;
  error: string | null;
  unlinking: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onPassword: (value: string) => void;
  onTogglePassword: () => void;
  onConfirm: () => void;
};

export function SingleSignOnView({
  providerName,
  passwordLogin = true,
  asking,
  password,
  showPassword,
  error,
  unlinking,
  onAsk,
  onCancel,
  onPassword,
  onTogglePassword,
  onConfirm,
}: Readonly<ViewProps>) {
  return (
    <Card padding="none">
      <PanelHeader title="Single sign-on" />
      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-cell font-medium text-fg" data-testid="sso-linked">
              Linked to {providerName}
            </p>
            <p className="max-w-md text-caption text-fg-subtle" data-testid="sso-note">
              {passwordLogin
                ? 'You can sign in with the provider. Unlinking keeps your password and your data; the next provider sign-in links again by your verified email address.'
                : `Passwords are turned off on this Quro instance, so ${providerName} is the only way to sign in. Only the operator can unlink it.`}
            </p>
          </div>
          {asking || !passwordLogin ? null : (
            <Button variant="secondary" size="sm" onClick={onAsk} data-testid="sso-unlink">
              Unlink
            </Button>
          )}
        </div>
        {asking && passwordLogin ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            <FormField label="Password" required error={error ?? undefined}>
              <PasswordInput
                autoComplete="current-password"
                placeholder="Enter your password to unlink"
                value={password}
                show={showPassword}
                error={Boolean(error)}
                onChange={onPassword}
                onToggle={onTogglePassword}
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={unlinking} disabled={password === ''}>
                Unlink {providerName}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

/** Shown only for an account that is linked to the provider. */
export function SingleSignOnPanel() {
  const link = useSingleSignOnLink();
  const unlink = useUnlinkSingleSignOn();
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!link.data?.linked) return null;
  const reset = () => {
    setAsking(false);
    setPassword('');
    setShowPassword(false);
    unlink.reset();
  };

  return (
    <SingleSignOnView
      providerName={link.data.providerName ?? 'your sign-in provider'}
      passwordLogin={link.data.passwordLogin}
      asking={asking}
      password={password}
      showPassword={showPassword}
      error={unlink.error ? resolveApiErrorMessage(unlink.error, 'Could not unlink') : null}
      unlinking={unlink.isPending}
      onAsk={() => setAsking(true)}
      onCancel={reset}
      onPassword={(value) => {
        setPassword(value);
        unlink.reset();
      }}
      onTogglePassword={() => setShowPassword((current) => !current)}
      onConfirm={() => unlink.mutate(password, { onSuccess: reset })}
    />
  );
}
