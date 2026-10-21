import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicAuthPolicy } from '@quro/shared';
import { SignInChoices, SingleSignOnButton, SingleSignOnNotice } from './SingleSignOn';

describe('SingleSignOnButton', () => {
  it('names the provider', () => {
    expect(renderToStaticMarkup(<SingleSignOnButton name="Authelia" />)).toContain(
      'Sign in with Authelia',
    );
  });
});

describe('SingleSignOnNotice', () => {
  it('announces the message', () => {
    const markup = renderToStaticMarkup(<SingleSignOnNotice message="Try again." />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Try again.');
  });
});

const POLICY: PublicAuthPolicy = {
  signUp: 'code',
  setupRequired: false,
  singleSignOn: { name: 'Authelia' },
  passwordLogin: true,
};

function choices(policy: PublicAuthPolicy | undefined, pending = false) {
  return renderToStaticMarkup(
    <SignInChoices
      policy={policy}
      pending={pending}
      passwordForm={<form data-testid="password-form">Password form</form>}
    />,
  );
}

describe('SignInChoices', () => {
  it('offers the provider next to the password form while passwords are on', () => {
    const markup = choices(POLICY);
    expect(markup).toContain('Sign in with Authelia');
    expect(markup).toContain('or use your email and password');
    expect(markup).toContain('data-testid="password-form"');
  });

  it('shows only the password form without a provider', () => {
    const markup = choices({ ...POLICY, singleSignOn: null });
    expect(markup).toContain('data-testid="password-form"');
    expect(markup).not.toContain('Sign in with');
  });

  it('shows only the provider button when passwords are turned off', () => {
    const markup = choices({ ...POLICY, signUp: 'closed', passwordLogin: false });
    expect(markup).toContain('Sign in with Authelia');
    expect(markup).toContain('Passwords are turned off');
    expect(markup).not.toContain('data-testid="password-form"');
    expect(markup).not.toContain('Forgot password');
    expect(markup).not.toContain('type="password"');
  });

  it('tells the operator how to create the first account instead of offering a dead button', () => {
    const markup = choices({
      ...POLICY,
      signUp: 'closed',
      setupRequired: true,
      passwordLogin: false,
    });
    expect(markup).toContain('quro user create');
    expect(markup).toContain('signin-sso-setup');
    expect(markup).not.toContain('signin-sso-button');
    expect(markup).not.toContain('data-testid="password-form"');
  });

  it('offers nothing while the answer is on its way, so no password form flashes up', () => {
    const markup = choices(undefined, true);
    expect(markup).toContain('Loading sign-in options');
    expect(markup).not.toContain('data-testid="password-form"');
    expect(markup).not.toContain('Sign in with');
  });

  it('falls back to the password form when the answer cannot be read; the server decides', () => {
    const markup = choices(undefined);
    expect(markup).toContain('data-testid="password-form"');
  });
});
