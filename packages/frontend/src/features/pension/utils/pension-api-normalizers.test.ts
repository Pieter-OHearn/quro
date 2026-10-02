/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import type { ApiPensionStatementImportRow } from '../types';
import {
  normalizePensionStatementDocument,
  normalizePensionStatementImportRow,
} from './pension-api-normalizers';

test('statement document normalization converts wire sizes while retaining the upload timestamp', () => {
  const document = normalizePensionStatementDocument({
    id: 1,
    potId: 2,
    transactionId: 3,
    fileName: 'statement.pdf',
    mimeType: 'application/pdf',
    sizeBytes: '1024',
    uploadedAt: '2026-09-01T10:00:00.000Z',
  });
  expect(document.sizeBytes).toBe(1024);
  expect(document.uploadedAt).toBe('2026-09-01T10:00:00.000Z');
});

test('import row normalization retains server dates and timestamps, including zero-based row order', () => {
  const row: ApiPensionStatementImportRow = {
    id: 1,
    importId: 2,
    rowOrder: 0,
    type: 'annual_statement',
    amount: 100,
    taxAmount: 0,
    date: '2025-12-31',
    note: '',
    isEmployer: null,
    confidence: 0.9,
    confidenceLabel: 'high',
    evidence: [{ page: 1, snippet: '  Closing balance  ' }],
    isDerived: false,
    isDeleted: false,
    committedTransactionId: null,
    editedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:30:00.000Z',
  };
  const normalized = normalizePensionStatementImportRow(row);
  expect(normalized.createdAt).toBe(row.createdAt);
  expect(normalized.updatedAt).toBe(row.updatedAt);
  expect(normalized.date).toBe(row.date);
  expect(normalized.rowOrder).toBe(0);
  expect(normalized.evidence).toEqual([{ page: 1, snippet: 'Closing balance' }]);
  expect(normalized.collisionWarning).toBeNull();
});
