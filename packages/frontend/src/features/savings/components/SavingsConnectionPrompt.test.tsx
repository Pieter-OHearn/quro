import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SavingsConnectionOutcome,
  SavingsConnectionPromptCard,
  SavingsConnectionPromptView,
} from './SavingsConnectionPrompt';

describe('SavingsConnectionPromptCard', () => {
  it('explains automatic bunq updates and exposes both actions', () => {
    const markup = renderToStaticMarkup(
      <SavingsConnectionPromptCard onConnect={() => undefined} onDismiss={() => undefined} />,
    );

    expect(markup).toContain('Keep your savings up to date with bunq');
    expect(markup).toContain('Real-time balances');
    expect(markup).toContain('Automatic transactions');
    expect(markup).toContain('Connect bunq');
    expect(markup).toContain('aria-label="Dismiss bunq connection suggestion"');
  });

  it('renders the container only when the user can act on the suggestion', () => {
    const baseProps = {
      userId: 1,
      isLoading: false,
      isError: false,
      hasConnection: false,
      dismissed: false,
      onConnect: () => undefined,
      onDismiss: () => undefined,
    } as const;

    expect(renderToStaticMarkup(<SavingsConnectionPromptView {...baseProps} />)).toContain(
      'Connect bunq',
    );
    expect(renderToStaticMarkup(<SavingsConnectionPromptView {...baseProps} hasConnection />)).toBe(
      '',
    );
    expect(renderToStaticMarkup(<SavingsConnectionPromptView {...baseProps} isLoading />)).toBe('');
    expect(renderToStaticMarkup(<SavingsConnectionPromptView {...baseProps} isError />)).toBe('');
    expect(renderToStaticMarkup(<SavingsConnectionPromptView {...baseProps} dismissed />)).toBe('');
    expect(
      renderToStaticMarkup(<SavingsConnectionPromptView {...baseProps} userId={undefined} />),
    ).toBe('');
  });

  it('shows success and error feedback after returning from OAuth', () => {
    const connectedMarkup = renderToStaticMarkup(
      <SavingsConnectionOutcome outcome="connected" onDismiss={() => undefined} />,
    );
    const errorMarkup = renderToStaticMarkup(
      <SavingsConnectionOutcome outcome="error" onDismiss={() => undefined} />,
    );

    expect(connectedMarkup).toContain('bunq connected');
    expect(connectedMarkup).toContain('update automatically');
    expect(errorMarkup).toContain('Could not connect bunq');
    expect(errorMarkup).toContain('Try connecting again');
  });
});
