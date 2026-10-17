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
