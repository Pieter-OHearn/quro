import { describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CsvImportPreview, CsvImportProfile } from '@quro/shared';
import { CsvImportDialog } from './components';
import { ReviewStep } from './components/ReviewStep';
import {
  draftFromProfile,
  draftFromSuggestion,
  draftProblem,
  draftToMapping,
  emptyDraft,
  profileFits,
} from './mappingDraft';

const PREVIEW: CsvImportPreview = {
  fileSha256: 'a'.repeat(64),
  headers: ['Date', 'Amount', 'Description'],
  delimiter: ',',
  dateFormat: 'YYYY-MM-DD',
  summary: {
    totalRows: 3,
    ready: 1,
    duplicate: 1,
    possibleDuplicate: 0,
    skipped: 0,
    error: 1,
    totals: [{ currency: 'EUR', amount: -3 }],
  },
  rows: [
    {
      rowNumber: 1,
      line: 2,
      status: 'ready',
      reason: null,
      date: '2026-01-02',
      amount: -3,
      currency: 'EUR',
      description: '=HYPERLINK("x")',
      category: null,
      externalId: 'h:1',
      formulaLike: true,
    },
    {
      rowNumber: 2,
      line: 3,
      status: 'duplicate',
      reason: 'Already imported from this source',
      date: '2026-01-03',
      amount: -4,
      currency: 'EUR',
      description: 'Bread',
      category: null,
      externalId: 'h:2',
      formulaLike: false,
    },
    {
      rowNumber: 3,
      line: 4,
      status: 'error',
      reason: 'The date does not match the date format',
      date: null,
      amount: null,
      currency: null,
      description: null,
      category: null,
      externalId: null,
      formulaLike: false,
    },
  ],
  reconciliation: null,
  warnings: ['Some text starts with = + - or @.'],
};

describe('mapping draft', () => {
  it('starts from the header guess and turns into a mapping without unused columns', () => {
    const draft = draftFromSuggestion(emptyDraft('EUR'), {
      date: 'Date',
      amount: 'Amount',
      debit: 'Out',
      description: 'Memo',
      balance: 'Saldo',
    });
    expect(draftProblem(draft)).toContain('Name the source');
    const named = { ...draft, source: ' ING ' };
    expect(draftProblem(named)).toBeNull();
    const savings = draftToMapping(named, 'savings');
    expect(savings.source).toBe('ING');
    expect(savings.columns).toEqual({
      date: 'Date',
      amount: 'Amount',
      description: 'Memo',
      balance: 'Saldo',
    });
    // A budget import has no balance column, and split columns drop the signed amount.
    const budget = draftToMapping(
      { ...named, amountMode: 'split', columns: { ...named.columns, category: 'Cat' } },
      'budget',
    );
    expect(budget.columns).toEqual({
      date: 'Date',
      debit: 'Out',
      description: 'Memo',
      category: 'Cat',
    });
  });

  it('asks for the amount columns the chosen mode needs', () => {
    const base = { ...emptyDraft('EUR'), source: 'Bank' };
    const columns = { ...base.columns, date: 'D', description: 'T' };
    expect(draftProblem({ ...base, columns })).toContain('amount column');
    expect(draftProblem({ ...base, columns, amountMode: 'split' })).toContain('debit or a credit');
  });

  it('offers a saved mapping only when every column it names is in the file', () => {
    const profile: CsvImportProfile = {
      id: 1,
      kind: 'savings',
      source: 'ING',
      updatedAt: '2026-01-01T00:00:00.000Z',
      mapping: {
        ...draftToMapping({ ...emptyDraft('EUR'), source: 'ING' }, 'savings'),
        columns: { date: 'Date', amount: 'Amount', description: 'Memo' },
        decimalSeparator: ',',
      },
    };
    expect(profileFits(profile, ['Date', 'Amount', 'Memo', 'Extra'])).toBe(true);
    expect(profileFits(profile, ['Date', 'Amount'])).toBe(false);
    const draft = draftFromProfile(emptyDraft('EUR'), profile);
    expect(draft).toMatchObject({ source: 'ING', decimalSeparator: ',', amountMode: 'signed' });
  });
});

describe('ReviewStep', () => {
  it('lists rows that need a look with their reason, and only ready rows are checked', () => {
    const markup = renderToStaticMarkup(
      <ReviewStep
        preview={PREVIEW}
        currency="EUR"
        selected={new Set([1])}
        onSelect={() => {}}
        saveProfile
        onSaveProfile={() => {}}
      />,
    );
    expect(markup).toContain('3 rows: 1 ready, 1 already imported, 1 with errors');
    expect(markup).toContain('The date does not match the date format');
    expect(markup).toContain('Some text starts with = + - or @.');
    expect(markup).toContain('Remember this column mapping');
    // The error row cannot be checked.
    expect(markup).toMatch(/aria-label="Import row 3"[^>]*disabled/);
  });
});

describe('CsvImportDialog', () => {
  it('opens on the file step and names the target account', () => {
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <CsvImportDialog
          kind="savings"
          account={{ id: 1, name: 'Holiday pot', currency: 'EUR' }}
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('Into Holiday pot');
    expect(markup).toContain('Choose a CSV file');
    expect(markup).toContain('nothing is written until');
  });
});
