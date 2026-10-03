/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PensionPot, PensionImportStatus } from '@quro/shared';
import { queryKeys } from '@/lib/queryKeys';
import { ImportPensionStatementModal } from './ImportPensionStatementModal';

function renderImport(status?: PensionImportStatus) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  if (status) {
    client.setQueryData(queryKeys.pensions.import(1), {
      id: 1,
      status,
      fileName: 'statement.pdf',
      errorMessage: 'Parser error',
    });
    client.setQueryData(queryKeys.pensions.importRows(1), []);
  }
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ImportPensionStatementModal
          pot={{ id: 2, name: 'Retirement', provider: 'Provider' } as PensionPot}
          initialImportId={status ? 1 : null}
          onClose={() => undefined}
        />
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}
test('new imports show the upload step with pension identity', () => {
  const markup = renderImport();
  expect(markup).toContain('Retirement');
  expect(markup).toContain('role="dialog"');
  expect(markup).toContain('aria-modal="true"');
  expect(markup).toContain('aria-label="Import Annual Statement"');
  expect(markup).toContain('Upload');
  expect(markup).not.toContain('Commit Transactions');
});
test('queued and processing imports keep their corresponding progress captions', () => {
  expect(renderImport('queued')).toContain('waiting in the processing queue');
  expect(renderImport('processing')).toContain('AI is extracting');
});
test('review and committed imports show review controls and require valid rows to commit', () => {
  for (const status of ['ready_for_review', 'committed'] as const) {
    const markup = renderImport(status);
    expect(markup).toContain('max-w-3xl');
    expect(markup).toContain('Commit Transactions');
    expect(markup).toMatch(/disabled=""[^>]*>Commit Transactions/);
  }
});
test('failed and unavailable imports keep their recovery views', () => {
  expect(renderImport('failed')).toContain('Parser error');
  expect(renderImport('failed')).toContain('Clear failed job');
  expect(renderImport('cancelled')).toContain('no longer available');
  expect(renderImport('expired')).toContain('no longer available');
});
