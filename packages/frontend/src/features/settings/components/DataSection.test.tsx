import { describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AccountDeletionPreview, User } from '@quro/shared';
import { DeleteAccountDialog, DeletionSummary } from './DataSection';

const PREVIEW: AccountDeletionPreview = {
  rowCounts: { savings_accounts: 2, savings_transactions: 5 },
  sharedWithPartner: 1,
  documentCount: 3,
  hasPartner: true,
};

describe('DeletionSummary', () => {
  it('counts records and documents and says what happens to the partner', () => {
    const markup = renderToStaticMarkup(<DeletionSummary preview={PREVIEW} />);
    expect(markup).toContain('7 records and 3 stored documents');
    expect(markup).toContain('1 joint accounts, properties and mortgages');
    expect(markup).toContain('Backups made before today');
  });

  it('leaves the partner out when there is none', () => {
    const markup = renderToStaticMarkup(
      <DeletionSummary preview={{ ...PREVIEW, hasPartner: false, sharedWithPartner: 0 }} />,
    );
    expect(markup).not.toContain('partner');
  });
});

describe('DeleteAccountDialog', () => {
  it('asks for the email and password, with cancel first and a disabled filled confirm', () => {
    const user = { email: 'someone@example.test' } as User;
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <DeleteAccountDialog user={user} onClose={() => {}} onDeleted={() => {}} />
      </QueryClientProvider>,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('Type someone@example.test to confirm');
    expect(markup.indexOf('>Cancel<')).toBeLessThan(markup.indexOf('>Delete account<'));
    expect(markup).toMatch(
      /<button[^>]*disabled[^>]*>Delete account<|disabled=""[^>]*>[^<]*Delete account/,
    );
    expect(markup).toContain('bg-danger text-fg-inverted');
  });

  it('asks for a recent single sign-on instead of a password when passwords are turned off', () => {
    const user = { email: 'someone@example.test' } as User;
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <DeleteAccountDialog
          user={user}
          passwordLogin={false}
          onClose={() => {}}
          onDeleted={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(markup).toContain('Type someone@example.test to confirm');
    expect(markup).toContain('delete-fresh-sign-in');
    expect(markup).not.toContain('type="password"');
  });
});
