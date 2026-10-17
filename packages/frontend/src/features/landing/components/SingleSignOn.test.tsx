import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SingleSignOnButton, SingleSignOnNotice } from './SingleSignOn';

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
