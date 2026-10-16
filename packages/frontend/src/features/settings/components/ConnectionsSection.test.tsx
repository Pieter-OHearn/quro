import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DisconnectBunqDialog, FeaturesList } from './ConnectionsSection';

describe('DisconnectBunqDialog', () => {
  it('asks before disconnecting, with cancel first and a filled confirm button', () => {
    const markup = renderToStaticMarkup(
      <DisconnectBunqDialog isPending={false} onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('Disconnect Bunq?');
    expect(markup).toContain('already imported stay');
    expect(markup.indexOf('>Cancel<')).toBeGreaterThan(-1);
    expect(markup.indexOf('>Cancel<')).toBeLessThan(markup.indexOf('>Disconnect Bunq<'));
    expect(markup).toContain('bg-danger text-fg-inverted');
  });
});

describe('FeaturesList', () => {
  const status = (enabled: boolean, lifecycle: 'stable' | 'experimental', message: string) => ({
    enabled,
    reason: enabled ? null : ('not_configured' as const),
    message,
    lifecycle,
    checkedAt: new Date(0).toISOString(),
  });

  it('says what is on, what is off and why, and marks the experimental feature', () => {
    const markup = renderToStaticMarkup(
      <FeaturesList
        capabilities={{
          documents: status(true, 'stable', 'Document storage is available.'),
          bunq: status(false, 'stable', 'Bunq linking is not set up on this server.'),
          pensionStatementImport: status(false, 'experimental', 'Statement import is not set up.'),
        }}
      />,
    );
    expect(markup).toContain('Features on this server');
    expect(markup).toContain('Bunq linking is not set up on this server.');
    expect(markup).toContain('Experimental');
    expect(markup).toContain('>On<');
    expect(markup).toContain('>Off<');
    expect(markup).toContain('ROADMAP.md');
    expect(markup).not.toMatch(/coming soon/i);
  });
});
