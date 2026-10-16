import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { GettingStartedCard } from './GettingStartedCard';

const render = (hasAccount: boolean, hasTransaction: boolean) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <GettingStartedCard progress={{ hasAccount, hasTransaction }} />
    </MemoryRouter>,
  );

describe('GettingStartedCard', () => {
  it('guides currency, sharing, the first account and the first transaction on an empty household', () => {
    const markup = render(false, false);
    expect(markup).toContain('Check currency and number format');
    expect(markup).toContain('Decide what is shared');
    expect(markup).toContain('Add your first account');
    expect(markup).toContain('Record your first transaction');
    expect(markup).toContain('href="/settings?tab=preferences"');
    expect(markup).not.toContain('aria-label="Done"');
  });

  it('checks off the steps the household has completed', () => {
    const markup = render(true, false);
    expect(markup.match(/aria-label="Done"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="To do"/g)).toHaveLength(1);
  });

  it('keeps only the next step description on a phone', () => {
    const markup = render(false, false);
    const shown = (text: string) => markup.includes(`text-caption text-fg-subtle">${text}`);
    const hidden = (text: string) => markup.includes(`max-sm:hidden">${text}`);
    expect(hidden('Totals and charts convert')).toBe(true);
    expect(hidden('Your data stays on this server')).toBe(true);
    expect(shown('A savings account is the quickest start')).toBe(true);
    expect(hidden('A deposit or a budget entry')).toBe(true);
  });

  it('disappears once there is an account and a transaction', () => {
    expect(render(true, true)).toBe('');
  });
});
