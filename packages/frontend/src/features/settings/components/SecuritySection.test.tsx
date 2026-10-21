import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PasswordsOffCard } from './SecuritySection';

describe('PasswordsOffCard', () => {
  it('replaces the password form and names the provider', () => {
    const markup = renderToStaticMarkup(<PasswordsOffCard providerName="Authelia" />);
    expect(markup).toContain('Signed in through Authelia');
    expect(markup).toContain('Passwords are turned off');
    expect(markup).not.toContain('type="password"');
    expect(markup).not.toContain('Current password');
    expect(markup).not.toContain('Save');
  });

  it('still reads well when the provider has no name', () => {
    const markup = renderToStaticMarkup(<PasswordsOffCard providerName={null} />);
    expect(markup).toContain('Signed in through single sign-on');
  });
});
