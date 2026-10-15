import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DisconnectBunqDialog } from './ConnectionsSection';

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
