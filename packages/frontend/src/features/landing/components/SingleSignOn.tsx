import type { ReactNode } from 'react';
import type { PublicAuthPolicy } from '@quro/shared';
import { Button } from '@/components/ui';

/** Starts a sign-in at the provider. It is a full navigation: the backend redirects the browser. */
export function SingleSignOnButton({ name }: Readonly<{ name: string }>) {
  return (
    <Button
      data-testid="signin-sso-button"
      variant="secondary"
      size="lg"
      fullWidth
      onClick={() => window.location.assign('/api/auth/oidc/login')}
    >
      Sign in with {name}
    </Button>
  );
}

export function SingleSignOnNotice({ message }: Readonly<{ message: string }>) {
  return (
    <p role="alert" data-testid="signin-sso-error" className="text-cell text-danger">
      {message}
    </p>
  );
}

/**
 * What the sign-in form offers when the operator turned passwords off: the provider's button and
 * nothing to type into. Before the first account exists the provider cannot sign anyone in, so the
 * form says how the operator creates it instead.
 */
function SingleSignOnOnly({
  name,
  setupRequired,
}: Readonly<{ name: string; setupRequired: boolean }>) {
  if (setupRequired) {
    return (
      <p data-testid="signin-sso-setup" className="text-body text-fg-muted">
        This Quro instance has no accounts yet. Whoever runs the server creates the first one with{' '}
        <code>quro user create</code> and an email address; you then sign in with {name} using that
        address.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <SingleSignOnButton name={name} />
      <p data-testid="signin-password-off" className="text-center text-cell text-fg-muted">
        Passwords are turned off on this Quro instance. The operator creates accounts; sign in with
        the email address they used.
      </p>
    </div>
  );
}

/**
 * The sign-in choices for what the instance allows. While the answer is on its way nothing is
 * offered, so a password form never flashes up on an instance that has none. If it cannot be read,
 * the password form is shown and the server, which decides, refuses what is turned off.
 */
export function SignInChoices({
  policy,
  pending,
  passwordForm,
}: Readonly<{
  policy: PublicAuthPolicy | undefined;
  pending: boolean;
  passwordForm: ReactNode;
}>) {
  if (pending) {
    return (
      <p role="status" className="text-cell text-fg-muted">
        Loading sign-in options…
      </p>
    );
  }
  if (policy?.passwordLogin === false && policy.singleSignOn) {
    return (
      <SingleSignOnOnly name={policy.singleSignOn.name} setupRequired={policy.setupRequired} />
    );
  }
  return (
    <>
      {/* A provider sign-in never creates an account, so it has nothing to offer before the first. */}
      {policy?.singleSignOn && !policy.setupRequired && (
        <div className="space-y-4">
          <SingleSignOnButton name={policy.singleSignOn.name} />
          <p className="text-center text-cell text-fg-muted">or use your email and password</p>
        </div>
      )}
      {passwordForm}
    </>
  );
}
