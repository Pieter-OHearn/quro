import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UserSession } from '@quro/shared';
import { SessionsList } from './SessionsPanel';

function session(overrides: Partial<UserSession>): UserSession {
  return {
    id: 'a'.repeat(64),
    current: false,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    createdAt: '2026-10-01T08:00:00.000Z',
    lastUsedAt: '2026-10-09T08:00:00.000Z',
    expiresAt: '2026-10-31T08:00:00.000Z',
    ...overrides,
  };
}

function render(sessions: UserSession[]) {
  return renderToStaticMarkup(
    <SessionsList
      sessions={sessions}
      revokingId={null}
      revokingOthers={false}
      error={null}
      onRevoke={() => {}}
      onRevokeOthers={() => {}}
    />,
  );
}

describe('SessionsList', () => {
  it('marks the current browser and offers sign-out only for the others', () => {
    const markup = render([
      session({ id: 'c'.repeat(64), current: true, userAgent: null }),
      session({ id: 'o'.repeat(64) }),
    ]);
    expect(markup).toContain('This browser');
    expect(markup).toContain('Unknown browser');
    expect(markup).toContain('Firefox on Linux');
    expect(markup.match(/>Sign out</g)).toHaveLength(1);
    expect(markup).toContain('Sign out all other browsers');
  });

  it('has nothing to sign out when only the current browser is signed in', () => {
    const markup = render([session({ current: true })]);
    expect(markup).not.toContain('>Sign out<');
    expect(markup).not.toContain('Sign out all other browsers');
  });
});
