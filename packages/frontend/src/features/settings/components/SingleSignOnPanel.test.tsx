import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SingleSignOnView } from './SingleSignOnPanel';

const noop = () => {};

function render(overrides: Partial<Parameters<typeof SingleSignOnView>[0]> = {}) {
  return renderToStaticMarkup(
    <SingleSignOnView
      providerName="Authelia"
      asking={false}
      password=""
      showPassword={false}
      error={null}
      unlinking={false}
      onAsk={noop}
      onCancel={noop}
      onPassword={noop}
      onTogglePassword={noop}
      onConfirm={noop}
      {...overrides}
    />,
  );
}

describe('SingleSignOnView', () => {
  it('says which provider the account is linked to and offers to unlink', () => {
    const markup = render();
    expect(markup).toContain('Linked to Authelia');
    expect(markup).toContain('>Unlink<');
    expect(markup).not.toContain('type="password"');
  });

  it('asks for the password before it unlinks, and shows a refusal', () => {
    const markup = render({ asking: true, error: 'Password is incorrect' });
    expect(markup).toContain('type="password"');
    expect(markup).toContain('Password is incorrect');
    expect(markup).toContain('Unlink Authelia');
    expect(markup).not.toContain('data-testid="sso-unlink"');
  });
});
