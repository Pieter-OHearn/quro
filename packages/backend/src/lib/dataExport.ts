import { createHash } from 'node:crypto';
import { getTableColumns } from 'drizzle-orm';
import { db } from '../db/client';
import type { DocumentStore } from './documentStore';
import { encodeCsv, type CsvValue } from './csv';
import { createZipWriter } from './zipWriter';
import {
  ACCOUNT_TABLES,
  countAccountRows,
  documentOfRow,
  selectAccountRows,
  type AccountTable,
} from './accountData';

// A data export: one ZIP archive with the account's own data as JSON and CSV, its stored documents
// and a manifest that lets the reader check all of it. The format is described in
// docs/data-export-and-deletion.md and in the README the archive carries.
//
// The data is read once, in a read-only transaction, so every table comes from the same
// snapshot. Documents are read from storage one at a time while the archive is sent, so memory
// holds the tables plus one document.

export const EXPORT_FORMAT = 'quro-export';
export const EXPORT_FORMAT_VERSION = 1;

const MIB = 1024 * 1024;
export const MAX_EXPORT_ROWS = 250_000;
export const MAX_EXPORT_DOCUMENTS = 2_000;
export const MAX_EXPORT_DOCUMENT_BYTES = 512 * MIB;

export class ExportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportLimitError';
  }
}

/** The export stopped because the account may no longer download it, or the client left. */
export class ExportStoppedError extends Error {
  constructor() {
    super('Export stopped');
    this.name = 'ExportStoppedError';
  }
}

type DocumentRef = {
  table: string;
  rowId: number;
  key: string;
  fileName: string;
  sizeBytes: number | null;
};

type PreparedTable = {
  name: string;
  columns: string[];
  rowCount: number;
  json: Buffer;
  csv: Buffer;
};

export type PreparedExport = {
  tables: PreparedTable[];
  documents: DocumentRef[];
  exportedAt: Date;
};

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

function omittedKeys(entry: AccountTable): Set<string> {
  return new Set(entry.omit);
}

function exportColumns(entry: AccountTable): string[] {
  const omit = omittedKeys(entry);
  const columns = Object.keys(getTableColumns(entry.table)).filter((key) => !omit.has(key));
  return entry.entryUser ? [...columns, 'enteredByPartner'] : columns;
}

function projectRow(
  entry: AccountTable,
  row: Record<string, unknown>,
  userId: number,
): Record<string, unknown> {
  const omit = omittedKeys(entry);
  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!omit.has(key)) projected[key] = value;
  }
  if (entry.entryUser) projected.enteredByPartner = row.userId !== userId;
  return projected;
}

function documentRef(entry: AccountTable, row: Record<string, unknown>): DocumentRef | null {
  const document = documentOfRow(entry, row);
  return document ? { table: entry.name, rowId: row.id as number, ...document } : null;
}

/**
 * Reads the account's data and builds every table file. Throws `ExportLimitError` before anything
 * is sent when the account holds more than an export carries.
 */
export type ExportLimits = { rows: number; documents: number; documentBytes: number };

export const EXPORT_LIMITS: ExportLimits = {
  rows: MAX_EXPORT_ROWS,
  documents: MAX_EXPORT_DOCUMENTS,
  documentBytes: MAX_EXPORT_DOCUMENT_BYTES,
};

export function prepareExport(
  userId: number,
  exportedAt = new Date(),
  limits: ExportLimits = EXPORT_LIMITS,
): Promise<PreparedExport> {
  return db.transaction(
    async (tx) => {
      const counts = new Map<string, number>();
      let totalRows = 0;
      for (const entry of ACCOUNT_TABLES) {
        const count = await countAccountRows(tx, entry, userId);
        counts.set(entry.name, count);
        totalRows += count;
      }
      if (totalRows > limits.rows) {
        throw new ExportLimitError(
          `This account holds more than ${limits.rows} rows, more than one export carries`,
        );
      }

      const tables: PreparedTable[] = [];
      const documents: DocumentRef[] = [];
      for (const entry of ACCOUNT_TABLES) {
        const rows = await selectAccountRows(tx, entry, userId);
        // The count and the rows come from one snapshot, so a difference is a defect, not a race.
        if (rows.length !== counts.get(entry.name)) {
          throw new Error(
            `Export of ${entry.name} read ${rows.length} rows, expected ${counts.get(entry.name)}`,
          );
        }
        for (const row of rows) {
          const ref = documentRef(entry, row);
          if (ref) documents.push(ref);
        }
        const columns = exportColumns(entry);
        const projected = rows.map((row) => projectRow(entry, row, userId));
        tables.push({
          name: entry.name,
          columns,
          rowCount: projected.length,
          json: Buffer.from(JSON.stringify(projected, null, 2), 'utf8'),
          csv: Buffer.from(encodeCsv(columns, projected as Record<string, CsvValue>[]), 'utf8'),
        });
      }

      if (documents.length > limits.documents) {
        throw new ExportLimitError(
          `This account holds more than ${limits.documents} documents, more than one export carries`,
        );
      }
      const documentBytes = documents.reduce((sum, ref) => sum + (ref.sizeBytes ?? 0), 0);
      if (documentBytes > limits.documentBytes) {
        throw new ExportLimitError(
          `This account's documents exceed ${limits.documentBytes / MIB} MiB, more than one export carries`,
        );
      }
      return { tables, documents, exportedAt };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

const SAFE_NAME = /[^A-Za-z0-9._-]+/g;
const MAX_NAME_LENGTH = 80;

/** A file name that is safe inside an archive: no path, no control characters, bounded length. */
export function archiveFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(SAFE_NAME, '_')
    .replace(/^[._]+/, '')
    .slice(-MAX_NAME_LENGTH);
  return cleaned === '' ? 'document' : cleaned;
}

export const EXPORT_README = `Quro data export
================

This archive holds the data of one Quro account, exported by its owner. Nothing in it is needed
to keep using Quro; it is yours to read, check and keep.

Files
-----
manifest.json   Format version, the export date, and for every table and document its row
                count or size and its SHA-256. Read this first. It is the last file in the
                archive.
data/*.json     One file per table: a JSON array of rows, every value exactly as stored.
csv/*.csv       The same rows as CSV (RFC 4180, UTF-8, CRLF line ends, a header row).
documents/      Stored documents (payslips, pension documents, statement uploads), named
                <table>/<row id>-<file name>. The manifest links each to its row.

Reading the data
----------------
- Row ids and the *Id columns link rows to each other (for example savings_transactions.accountId
  is savings_accounts.id). Ids are only meaningful inside this archive.
- Money amounts are numbers in the currency named by the row's currency column (or by
  sourceCurrency and baseCurrency where a row carries them). Nothing is converted. Debts,
  mortgages and negative equity keep their sign. Unit prices, quantities and rates are not money.
- Dates are YYYY-MM-DD; timestamps are ISO 8601 in UTC.
- A column that is empty (null) in the JSON is an empty cell in the CSV.
- In CSV, text that starts with =, +, - , @, a tab or a carriage return gets a leading
  apostrophe, so a spreadsheet shows it as text instead of running it. Remove the apostrophe
  when you read such a value back. The JSON files never change a value.
- enteredByPartner (joint ledgers) says whether your partner entered the row.
- Joint accounts, properties and mortgages you own are included in full, not halved.

What is not in the archive
--------------------------
- Your password, sessions, sign-in codes, bank-link credentials and encryption keys.
- Rows owned by your partner, including their joint rows. They are theirs to export.
- Shared exchange rates and the stock exchange list.
- Background job state (statement import queue, bank sync progress).

Quro has no import for this format yet. The CSV files are meant for spreadsheets and for other
tools.
`;

type ManifestFile = { path: string; sha256: string; bytes: number };

/**
 * The archive, entry by entry. `stillAllowed` is asked before the documents are read and before
 * each one, so a session that ended, an account that was deleted or a client that left stops the
 * work instead of finishing it.
 */
export async function* exportArchive(
  prepared: PreparedExport,
  options: {
    store: DocumentStore;
    quroVersion: string;
    stillAllowed: () => Promise<boolean>;
    cancelled: () => boolean;
  },
): AsyncGenerator<Buffer> {
  const zip = createZipWriter(prepared.exportedAt);
  const check = async () => {
    if (options.cancelled() || !(await options.stillAllowed())) throw new ExportStoppedError();
  };

  await check();
  yield zip.addEntry('README.txt', Buffer.from(EXPORT_README, 'utf8'), { compress: true });

  const manifestTables: Record<
    string,
    { rows: number; columns: string[]; json: ManifestFile; csv: ManifestFile }
  > = {};
  for (const table of prepared.tables) {
    const jsonPath = `data/${table.name}.json`;
    const csvPath = `csv/${table.name}.csv`;
    manifestTables[table.name] = {
      rows: table.rowCount,
      columns: table.columns,
      json: { path: jsonPath, sha256: sha256(table.json), bytes: table.json.byteLength },
      csv: { path: csvPath, sha256: sha256(table.csv), bytes: table.csv.byteLength },
    };
    yield zip.addEntry(jsonPath, table.json, { compress: true });
    yield zip.addEntry(csvPath, table.csv, { compress: true });
  }

  const included: Array<ManifestFile & { table: string; rowId: number; fileName: string }> = [];
  // Rows whose document the store no longer holds: the row is exported, the file is not.
  const missing: Array<{ table: string; rowId: number; fileName: string }> = [];
  let documentBytes = 0;
  for (const ref of prepared.documents) {
    await check();
    const body = await options.store.get(ref.key).catch(() => null);
    if (body === null) {
      missing.push({ table: ref.table, rowId: ref.rowId, fileName: ref.fileName });
      continue;
    }
    documentBytes += body.byteLength;
    if (documentBytes > MAX_EXPORT_DOCUMENT_BYTES)
      throw new ExportLimitError('Documents too large');
    const path = `documents/${ref.table}/${ref.rowId}-${archiveFileName(ref.fileName)}`;
    included.push({
      table: ref.table,
      rowId: ref.rowId,
      fileName: ref.fileName,
      path,
      sha256: sha256(body),
      bytes: body.byteLength,
    });
    yield zip.addEntry(path, body, { compress: false });
  }

  const manifest = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    quroVersion: options.quroVersion,
    exportedAt: prepared.exportedAt.toISOString(),
    tables: manifestTables,
    documents: { included, missing },
  };
  yield zip.addEntry('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), {
    compress: true,
  });
  yield zip.finish();
}

/** The archive as a byte stream. Cancelling the stream stops the work after the current entry. */
export function exportStream(
  prepared: PreparedExport,
  options: Omit<Parameters<typeof exportArchive>[1], 'cancelled'> & { onClose?: () => void },
): ReadableStream<Uint8Array> {
  let cancelled = false;
  const iterator = exportArchive(prepared, { ...options, cancelled: () => cancelled });
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          options.onClose?.();
          controller.close();
        } else {
          controller.enqueue(next.value);
        }
      } catch (error) {
        options.onClose?.();
        controller.error(error);
      }
    },
    async cancel() {
      cancelled = true;
      await iterator.return(undefined);
      options.onClose?.();
    },
  });
}
