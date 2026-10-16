import { and, asc, count, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  CSV_IMPORT_LIMITS,
  roundMoney,
  sumMoney,
  toCents,
  type CsvClosingBalance,
  type CsvDelimiter,
  type CsvImportKind,
  type CsvImportMapping,
  type CsvImportPreview,
  type CsvImportProgress,
  type CsvImportRowOutcome,
  type CsvPreviewRow,
  type CsvReconciliation,
  type CurrencyCode,
} from '@quro/shared';
import { db, type DbExecutor, type DbTransaction } from '../../db/client';
import {
  budgetCategories,
  budgetTransactions,
  csvImportRows,
  csvImports,
  importProfiles,
  savingsAccounts,
  savingsTransactions,
} from '../../db/schema';
import { findOrCreateCategoryByName } from '../../services/bunqBudgetSync';
import { findAccessible } from '../access';
import { budgetRateToEur } from '../budgetCurrency';
import { lockLedgerParents, withLedgerWrite } from '../ledgerWrite';
import { toSignedSavingsAmount, updateSavingsAccountBalanceByDelta } from '../savingsBalance';
import { suggestColumns } from './normalize';
import { CsvFormatError, parseCsv } from './parse';
import {
  analyzeCsv,
  budgetMonthOf,
  ImportInputError,
  totalsByCurrency,
  type Analysis,
  type AnalyzedRow,
} from './analyze';

export { ImportInputError } from './analyze';

/** The header, a few sample rows and a column guess for a file, before any mapping exists. */
export function describeCsv(csv: string, delimiter: CsvDelimiter) {
  let parsed;
  try {
    parsed = parseCsv(csv, delimiter);
  } catch (error) {
    if (error instanceof CsvFormatError) throw new ImportInputError(error.message);
    throw error;
  }
  return {
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    rowCount: parsed.records.length,
    sample: parsed.records.slice(0, SAMPLE_ROWS).map((record) => record.cells),
    suggestion: suggestColumns(parsed.headers),
  };
}

/** A refusal the route answers with its status; the message never names another account's data. */
export class ImportRefused extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'ImportRefused';
  }
}

export type ImportScope = { userId: number; partnerId: number | null };
export type EnteredClosing = { amount: number; date: string } | null;

type Account = typeof savingsAccounts.$inferSelect;
const ACCOUNT_NOT_FOUND = 'Account not found';
const KEY_CHUNK = 1_000;
const ROW_INSERT_CHUNK = 500;
export const SAMPLE_ROWS = 3;
const RECONCILIATION_SOURCE = 'reconciliation';

// ── Target ───────────────────────────────────────────────────────────────────

async function requireAccount(
  scope: ImportScope,
  accountId: number,
  executor: DbExecutor = db,
): Promise<Account> {
  const account = await findAccessible(savingsAccounts, accountId, scope, {
    where: isNull(savingsAccounts.archivedAt),
    executor,
  });
  if (!account) throw new ImportRefused(404, ACCOUNT_NOT_FOUND);
  if (account.bunqAccountId) {
    throw new ImportRefused(400, 'Cannot import into a Bunq-synced account');
  }
  return account;
}

// ── Reading the ledger ───────────────────────────────────────────────────────

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function existingKeys(
  kind: CsvImportKind,
  scope: ImportScope,
  account: Account | null,
  source: string,
  externalIds: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunks(externalIds, KEY_CHUNK)) {
    const rows =
      kind === 'savings'
        ? await db
            .select({ id: savingsTransactions.externalId })
            .from(savingsTransactions)
            .where(
              and(
                eq(savingsTransactions.accountId, account!.id),
                eq(savingsTransactions.importSource, source),
                inArray(savingsTransactions.externalId, part),
              ),
            )
        : await db
            .select({ id: budgetTransactions.externalId })
            .from(budgetTransactions)
            .where(
              and(
                eq(budgetTransactions.userId, scope.userId),
                eq(budgetTransactions.importSource, source),
                inArray(budgetTransactions.externalId, part),
              ),
            );
    for (const row of rows) if (row.id !== null) found.add(row.id);
  }
  return found;
}

/** Same day and amount as a row already in the ledger: likely the same payment, entered another way. */
async function lookalikeKeys(
  kind: CsvImportKind,
  scope: ImportScope,
  account: Account | null,
  rows: readonly AnalyzedRow[],
): Promise<Set<string>> {
  const dates = rows.map((entry) => entry.row!.date).sort();
  if (dates.length === 0) return new Set();
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;
  const keys = new Set<string>();
  if (kind === 'savings') {
    const existing = await db
      .select({
        date: savingsTransactions.date,
        type: savingsTransactions.type,
        amount: savingsTransactions.amount,
      })
      .from(savingsTransactions)
      .where(
        and(
          eq(savingsTransactions.accountId, account!.id),
          gte(savingsTransactions.date, from),
          lte(savingsTransactions.date, to),
        ),
      );
    for (const row of existing) {
      keys.add(`${row.date}|${toCents(toSignedSavingsAmount(row.type, row.amount))}`);
    }
    return keys;
  }
  const existing = await db
    .select({
      date: budgetTransactions.date,
      amount: sql<number>`coalesce(${budgetTransactions.sourceAmount}, ${budgetTransactions.amount})`,
      currency: sql<string>`coalesce(${budgetTransactions.sourceCurrency}, ${budgetTransactions.currency})`,
    })
    .from(budgetTransactions)
    .where(
      and(
        eq(budgetTransactions.userId, scope.userId),
        gte(budgetTransactions.date, from),
        lte(budgetTransactions.date, to),
      ),
    );
  for (const row of existing) {
    keys.add(`${row.date}|${row.currency}|${toCents(Math.abs(Number(row.amount)))}`);
  }
  return keys;
}

const lookalikeOf = (kind: CsvImportKind, entry: AnalyzedRow) => {
  const row = entry.row!;
  return kind === 'savings'
    ? `${row.date}|${toCents(row.amount)}`
    : `${row.date}|${row.currency}|${toCents(Math.abs(row.amount))}`;
};

async function markAgainstLedger(
  kind: CsvImportKind,
  scope: ImportScope,
  account: Account | null,
  source: string,
  analysis: Analysis,
): Promise<void> {
  const candidates = analysis.rows.filter((entry) => entry.status === 'ready');
  const known = await existingKeys(
    kind,
    scope,
    account,
    source,
    candidates.map((entry) => entry.externalId!),
  );
  for (const entry of candidates) {
    if (known.has(entry.externalId!)) {
      entry.status = 'duplicate';
      entry.reason = 'Already imported from this source';
    }
  }
  const remaining = candidates.filter((entry) => entry.status === 'ready');
  const lookalikes = await lookalikeKeys(kind, scope, account, remaining);
  for (const entry of remaining) {
    if (lookalikes.has(lookalikeOf(kind, entry))) {
      entry.status = 'possibleDuplicate';
      entry.reason = 'A row with the same date and amount is already in the ledger';
    }
  }
}

/** The account balance on `date`, from the stored balance minus what was booked after it. */
async function ledgerBalanceOn(executor: DbExecutor, accountId: number, date: string) {
  const [account] = await executor
    .select({ balance: savingsAccounts.balance })
    .from(savingsAccounts)
    .where(eq(savingsAccounts.id, accountId));
  const [later] = await executor
    .select({
      total: sql<string>`coalesce(sum(case when ${savingsTransactions.type} = 'withdrawal' then -${savingsTransactions.amount} else ${savingsTransactions.amount} end), 0)`,
    })
    .from(savingsTransactions)
    .where(and(eq(savingsTransactions.accountId, accountId), gt(savingsTransactions.date, date)));
  return roundMoney((account?.balance ?? 0) - Number(later?.total ?? 0));
}

function pickClosing(analysis: Analysis, entered: EnteredClosing): CsvClosingBalance | null {
  if (entered) {
    return { amount: entered.amount, date: entered.date, origin: 'entered', rowNumber: null };
  }
  return analysis.closing;
}

function compare(closing: CsvClosingBalance, ledgerBalance: number): CsvReconciliation {
  return {
    closing,
    ledgerBalance,
    difference: roundMoney((toCents(closing.amount) - toCents(ledgerBalance)) / 100),
  };
}

// ── Preview ──────────────────────────────────────────────────────────────────

export type ImportInput = {
  kind: CsvImportKind;
  accountId: number | null;
  csv: string;
  mapping: CsvImportMapping;
  closing: EnteredClosing;
};

async function prepare(scope: ImportScope, input: ImportInput) {
  const account = input.kind === 'savings' ? await requireAccount(scope, input.accountId!) : null;
  if (input.csv.length > CSV_IMPORT_LIMITS.maxBytes) {
    throw new ImportRefused(400, 'The file is too large');
  }
  const analysis = analyzeCsv({
    kind: input.kind,
    csv: input.csv,
    mapping: input.mapping,
    accountCurrency: account?.currency,
  });
  await markAgainstLedger(input.kind, scope, account, input.mapping.source, analysis);
  return {
    account,
    analysis,
    closing: input.kind === 'savings' ? pickClosing(analysis, input.closing) : null,
  };
}

const NO_ROW = {
  date: null,
  amount: null,
  currency: null,
  description: null,
  category: null,
  formulaLike: false,
};

const toPreviewRow = (entry: AnalyzedRow): CsvPreviewRow => ({
  rowNumber: entry.rowNumber,
  line: entry.line,
  status: entry.status,
  reason: entry.reason,
  externalId: entry.externalId,
  ...(entry.row
    ? {
        date: entry.row.date,
        amount: entry.row.amount,
        currency: entry.row.currency,
        description: entry.row.description,
        category: entry.row.category,
        formulaLike: entry.row.formulaLike,
      }
    : NO_ROW),
});

/** A dry run: reads the file and the ledger, writes nothing. */
export async function previewImport(
  scope: ImportScope,
  input: ImportInput,
): Promise<CsvImportPreview> {
  const { account, analysis, closing } = await prepare(scope, input);
  const count = (status: AnalyzedRow['status']) =>
    analysis.rows.filter((entry) => entry.status === status).length;

  let reconciliation: CsvReconciliation | null = null;
  if (account && closing) {
    // The ledger as it will stand on the closing date once the ready rows are in.
    const arriving = analysis.rows
      .filter((entry) => entry.status === 'ready' && entry.row!.date <= closing.date)
      .map((entry) => entry.row!.amount);
    const current = await ledgerBalanceOn(db, account.id, closing.date);
    reconciliation = compare(closing, roundMoney(current + sumMoney(arriving)));
  }
  return {
    fileSha256: analysis.fileSha256,
    headers: analysis.headers,
    delimiter: analysis.delimiter,
    dateFormat: analysis.dateFormat as CsvImportPreview['dateFormat'],
    summary: {
      totalRows: analysis.rows.length,
      ready: count('ready'),
      duplicate: count('duplicate'),
      possibleDuplicate: count('possibleDuplicate'),
      skipped: count('skipped'),
      error: count('error'),
      totals: totalsByCurrency(analysis.rows, 'ready'),
    },
    rows: analysis.rows.map(toPreviewRow),
    reconciliation,
    warnings: analysis.warnings,
  };
}

// ── Staging ──────────────────────────────────────────────────────────────────

export type StageInput = ImportInput & {
  fileName: string | null;
  fileSha256: string;
  selectedRows: number[];
  saveProfile: boolean;
};

/** Stores the approved rows for committing. Writes no ledger row. */
export async function stageImport(scope: ImportScope, input: StageInput): Promise<number> {
  const { account, analysis, closing } = await prepare(scope, input);
  if (analysis.fileSha256 !== input.fileSha256) {
    throw new ImportRefused(409, 'The file changed since the preview; review it again');
  }
  const byNumber = new Map(analysis.rows.map((entry) => [entry.rowNumber, entry]));
  const selected = [...new Set(input.selectedRows)].sort((a, b) => a - b);
  if (selected.length === 0) throw new ImportRefused(400, 'Select at least one row to import');
  for (const rowNumber of selected) {
    const entry = byNumber.get(rowNumber);
    if (!entry || (entry.status !== 'ready' && entry.status !== 'possibleDuplicate')) {
      throw new ImportRefused(400, `Row ${rowNumber} cannot be imported`);
    }
  }

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(csvImports)
      .values({
        userId: scope.userId,
        kind: input.kind,
        accountId: account ? account.id : null,
        source: input.mapping.source,
        fileName: input.fileName,
        fileSha256: analysis.fileSha256,
        mapping: input.mapping,
        ...closingColumns(closing),
      })
      .returning({ id: csvImports.id });
    const importId = created!.id;
    await insertStagedRows(
      tx,
      importId,
      selected.map((rowNumber) => byNumber.get(rowNumber)!),
    );
    if (input.saveProfile) await saveProfile(tx, scope, input.kind, input.mapping);
    return importId;
  });
}

function closingColumns(closing: CsvClosingBalance | null) {
  return {
    closingBalance: closing ? closing.amount : null,
    closingDate: closing ? closing.date : null,
    closingOrigin: closing ? closing.origin : null,
    closingRowNumber: closing ? closing.rowNumber : null,
  };
}

async function insertStagedRows(
  tx: DbTransaction,
  importId: number,
  entries: readonly AnalyzedRow[],
): Promise<void> {
  const values = entries.map((entry) => {
    const row = entry.row!;
    return {
      importId,
      rowNumber: entry.rowNumber,
      externalId: entry.externalId!,
      date: row.date,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      merchant: row.merchant,
      categoryName: row.category,
    };
  });
  for (const part of chunks(values, ROW_INSERT_CHUNK)) {
    await tx.insert(csvImportRows).values(part);
  }
}

async function saveProfile(
  tx: DbTransaction,
  scope: ImportScope,
  kind: CsvImportKind,
  mapping: CsvImportMapping,
): Promise<void> {
  await tx
    .insert(importProfiles)
    .values({ userId: scope.userId, kind, source: mapping.source, mapping })
    .onConflictDoUpdate({
      target: [importProfiles.userId, importProfiles.kind, importProfiles.source],
      set: { mapping, updatedAt: new Date() },
    });
}

// ── Progress ─────────────────────────────────────────────────────────────────

async function findImport(scope: ImportScope, importId: number, executor: DbExecutor = db) {
  const [row] = await executor
    .select()
    .from(csvImports)
    .where(and(eq(csvImports.id, importId), eq(csvImports.userId, scope.userId)));
  if (!row) throw new ImportRefused(404, 'Import not found');
  return row;
}

async function rowCounts(executor: DbExecutor, importId: number) {
  const rows = await executor
    .select({ status: csvImportRows.status, total: count() })
    .from(csvImportRows)
    .where(eq(csvImportRows.importId, importId))
    .groupBy(csvImportRows.status);
  const by = Object.fromEntries(rows.map((row) => [row.status, row.total]));
  return {
    pending: by.pending ?? 0,
    committed: by.committed ?? 0,
    duplicate: by.duplicate ?? 0,
    failed: by.failed ?? 0,
  };
}

async function toProgress(
  executor: DbExecutor,
  imp: typeof csvImports.$inferSelect,
): Promise<CsvImportProgress> {
  const counts = await rowCounts(executor, imp.id);
  let reconciliation: CsvImportProgress['reconciliation'] = null;
  if (
    imp.kind === 'savings' &&
    imp.accountId !== null &&
    imp.closingBalance !== null &&
    imp.closingDate !== null &&
    imp.status !== 'cancelled' &&
    counts.committed > 0
  ) {
    const closing: CsvClosingBalance = {
      amount: imp.closingBalance,
      date: imp.closingDate,
      origin: imp.closingOrigin === 'entered' ? 'entered' : 'column',
      rowNumber: imp.closingRowNumber,
    };
    reconciliation = {
      ...compare(closing, await ledgerBalanceOn(executor, imp.accountId, imp.closingDate)),
      adjustmentApplied: imp.adjustmentTransactionId !== null,
    };
  }
  return {
    id: imp.id,
    kind: imp.kind as CsvImportKind,
    accountId: imp.accountId,
    source: imp.source,
    fileName: imp.fileName,
    fileSha256: imp.fileSha256,
    status: imp.status as CsvImportProgress['status'],
    total: counts.pending + counts.committed + counts.duplicate + counts.failed,
    ...counts,
    createdAt: imp.createdAt.toISOString(),
    committedAt: imp.committedAt?.toISOString() ?? null,
    reconciliation,
  };
}

export async function getImportProgress(scope: ImportScope, importId: number) {
  return toProgress(db, await findImport(scope, importId));
}

export async function listImports(
  scope: ImportScope,
  filter: { kind?: CsvImportKind; accountId?: number },
): Promise<CsvImportProgress[]> {
  const rows = await db
    .select()
    .from(csvImports)
    .where(
      and(
        eq(csvImports.userId, scope.userId),
        filter.kind ? eq(csvImports.kind, filter.kind) : undefined,
        filter.accountId ? eq(csvImports.accountId, filter.accountId) : undefined,
      ),
    )
    .orderBy(sql`${csvImports.id} desc`)
    .limit(20);
  return Promise.all(rows.map((row) => toProgress(db, row)));
}

export async function listImportRows(
  scope: ImportScope,
  importId: number,
  page: { offset: number; limit: number },
): Promise<CsvImportRowOutcome[]> {
  await findImport(scope, importId);
  const rows = await db
    .select()
    .from(csvImportRows)
    .where(eq(csvImportRows.importId, importId))
    .orderBy(asc(csvImportRows.rowNumber))
    .offset(page.offset)
    .limit(page.limit);
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    status: row.status as CsvImportRowOutcome['status'],
    date: row.date,
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    error: row.error,
    transactionId: row.transactionId,
  }));
}

// ── Committing ───────────────────────────────────────────────────────────────

type StagedRow = typeof csvImportRows.$inferSelect;
type RowResult = {
  id: number;
  status: 'committed' | 'duplicate' | 'failed';
  transactionId?: number;
  error?: string;
};

async function writeSavingsBatch(
  tx: DbTransaction,
  scope: ImportScope,
  imp: typeof csvImports.$inferSelect,
  account: Account,
  rows: StagedRow[],
): Promise<RowResult[]> {
  const inserted = await tx
    .insert(savingsTransactions)
    .values(
      rows.map((row) => ({
        userId: account.userId,
        accountId: account.id,
        type: row.amount < 0 ? 'withdrawal' : 'deposit',
        amount: Math.abs(row.amount),
        date: row.date,
        note: row.description,
        importId: imp.id,
        importSource: imp.source,
        externalId: row.externalId,
      })),
    )
    .onConflictDoNothing({
      target: [
        savingsTransactions.accountId,
        savingsTransactions.importSource,
        savingsTransactions.externalId,
      ],
    })
    .returning({
      id: savingsTransactions.id,
      externalId: savingsTransactions.externalId,
      type: savingsTransactions.type,
      amount: savingsTransactions.amount,
      date: savingsTransactions.date,
    });
  if (inserted.length > 0) {
    await updateSavingsAccountBalanceByDelta(
      tx,
      account.id,
      sumMoney(inserted.map((row) => toSignedSavingsAmount(row.type, row.amount))),
    );
    await withLedgerWrite(
      tx,
      { ...account, partnerId: account.userId === scope.userId ? scope.partnerId : scope.userId },
      inserted.map((row) => row.date).sort()[0]!,
    );
  }
  const idByKey = new Map(inserted.map((row) => [row.externalId, row.id]));
  return rows.map((row) => {
    const transactionId = idByKey.get(row.externalId);
    return transactionId === undefined
      ? { id: row.id, status: 'duplicate' as const }
      : { id: row.id, status: 'committed' as const, transactionId };
  });
}

async function writeBudgetBatch(
  tx: DbTransaction,
  scope: ImportScope,
  imp: typeof csvImports.$inferSelect,
  rows: StagedRow[],
  rates: ReadonlyMap<CurrencyCode, number | null>,
): Promise<RowResult[]> {
  const results: RowResult[] = [];
  // Categories first, by id, before any ledger row (the order every ledger write uses).
  const categoryIds = new Map<string, number>();
  const usable: StagedRow[] = [];
  for (const row of rows) {
    if (rates.get(row.currency) == null) {
      results.push({ id: row.id, status: 'failed', error: `No exchange rate for ${row.currency}` });
      continue;
    }
    usable.push(row);
    const { month, year } = budgetMonthOf(row.date);
    const key = `${row.categoryName}|${month}|${year}`;
    if (!categoryIds.has(key)) {
      categoryIds.set(
        key,
        await findOrCreateCategoryByName(tx, scope.userId, row.categoryName!, month, year),
      );
    }
  }
  await lockLedgerParents(tx, budgetCategories, [...categoryIds.values()]);

  const spentBy = new Map<number, number[]>();
  for (const row of usable) {
    const { month, year } = budgetMonthOf(row.date);
    const categoryId = categoryIds.get(`${row.categoryName}|${month}|${year}`)!;
    const source = Math.abs(row.amount);
    const amount = roundMoney(source * rates.get(row.currency)!);
    const [inserted] = await tx
      .insert(budgetTransactions)
      .values({
        userId: scope.userId,
        categoryId,
        description: row.description,
        merchant: row.merchant ?? row.description,
        amount,
        currency: 'EUR',
        sourceAmount: source,
        sourceCurrency: row.currency,
        date: row.date,
        importId: imp.id,
        importSource: imp.source,
        externalId: row.externalId,
      })
      .onConflictDoNothing({
        target: [
          budgetTransactions.userId,
          budgetTransactions.importSource,
          budgetTransactions.externalId,
        ],
      })
      .returning({ id: budgetTransactions.id });
    if (!inserted) {
      results.push({ id: row.id, status: 'duplicate' });
      continue;
    }
    spentBy.set(categoryId, [...(spentBy.get(categoryId) ?? []), amount]);
    results.push({ id: row.id, status: 'committed', transactionId: inserted.id });
  }
  for (const [categoryId, amounts] of spentBy) {
    await tx
      .update(budgetCategories)
      .set({ spent: sql`${budgetCategories.spent} + ${sumMoney(amounts)}::numeric` })
      .where(eq(budgetCategories.id, categoryId));
  }
  return results;
}

async function currencyRates(rows: readonly { currency: CurrencyCode }[]) {
  const rates = new Map<CurrencyCode, number | null>();
  for (const currency of new Set(rows.map((row) => row.currency))) {
    try {
      rates.set(currency, await budgetRateToEur(currency));
    } catch {
      // Fails closed: rows in a currency without a usable rate are marked failed, never converted at 1.
      rates.set(currency, null);
    }
  }
  return rates;
}

/**
 * Writes the next batch (at most `commitBatchRows`) of staged rows in one transaction and answers
 * with the progress. Call it again until nothing is pending. A crash, a closed tab or a second
 * caller costs nothing: finished rows stay finished, the unique import key turns a row another
 * import already wrote into a duplicate, and calls for one import run one at a time.
 */
export async function commitNextBatch(
  scope: ImportScope,
  importId: number,
): Promise<CsvImportProgress> {
  const first = await findImport(scope, importId);
  if (first.status !== 'staged') return toProgress(db, first);

  // Rates are read before the transaction: a rate lookup may call out and must not hold locks.
  const pendingCurrencies =
    first.kind === 'budget'
      ? await db
          .selectDistinct({ currency: csvImportRows.currency })
          .from(csvImportRows)
          .where(and(eq(csvImportRows.importId, importId), eq(csvImportRows.status, 'pending')))
      : [];
  const rates = await currencyRates(pendingCurrencies);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`csv-import:${importId}`}))`);
    const imp = await findImport(scope, importId, tx);
    if (imp.status !== 'staged') return toProgress(tx, imp);

    let account: Account | null = null;
    if (imp.kind === 'savings') {
      account = await requireAccount(scope, imp.accountId!, tx).catch(() => {
        throw new ImportRefused(409, 'The account is no longer available for imports');
      });
      await lockLedgerParents(tx, savingsAccounts, [account.id]);
    }
    const rows = await tx
      .select()
      .from(csvImportRows)
      .where(and(eq(csvImportRows.importId, importId), eq(csvImportRows.status, 'pending')))
      .orderBy(asc(csvImportRows.rowNumber))
      .limit(CSV_IMPORT_LIMITS.commitBatchRows);

    if (rows.length > 0) {
      const results = account
        ? await writeSavingsBatch(tx, scope, imp, account, rows)
        : await writeBudgetBatch(tx, scope, imp, rows, rates);
      for (const result of results) {
        await tx
          .update(csvImportRows)
          .set({
            status: result.status,
            transactionId: result.transactionId ?? null,
            error: result.error ?? null,
          })
          .where(eq(csvImportRows.id, result.id));
      }
    }
    const counts = await rowCounts(tx, importId);
    if (counts.pending === 0) {
      await tx
        .update(csvImports)
        .set({ status: 'committed', committedAt: new Date() })
        .where(eq(csvImports.id, importId));
    }
    return toProgress(tx, await findImport(scope, importId, tx));
  });
}

/** Stops a staged import. Rows already written stay (and stay traceable); nothing more is written. */
export function cancelImport(scope: ImportScope, importId: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`csv-import:${importId}`}))`);
    const imp = await findImport(scope, importId, tx);
    if (imp.status === 'committed') throw new ImportRefused(409, 'The import has already finished');
    if (imp.status === 'staged') {
      await tx.update(csvImports).set({ status: 'cancelled' }).where(eq(csvImports.id, importId));
    }
    return toProgress(tx, await findImport(scope, importId, tx));
  });
}

// ── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Books the difference between the statement's closing balance and the ledger as one labelled
 * adjustment on the closing date. The caller sends the difference it was shown; if the ledger
 * moved since, nothing is written and the answer says so. One adjustment per import.
 */
export async function reconcileImport(
  scope: ImportScope,
  importId: number,
  expectedDifference: number,
): Promise<CsvImportProgress> {
  const start = await findImport(scope, importId);
  if (start.kind !== 'savings' || start.accountId === null) {
    throw new ImportRefused(400, 'Only a savings import has a balance to reconcile');
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`csv-import:${importId}`}))`);
    const account = await requireAccount(scope, start.accountId!, tx).catch(() => {
      throw new ImportRefused(409, 'The account is no longer available for imports');
    });
    await lockLedgerParents(tx, savingsAccounts, [account.id]);
    const imp = await findImport(scope, importId, tx);
    if (imp.status !== 'committed') {
      throw new ImportRefused(409, 'Finish the import before reconciling it');
    }
    if (imp.closingBalance === null || imp.closingDate === null) {
      throw new ImportRefused(400, 'The import has no closing balance to compare with');
    }
    if (imp.adjustmentTransactionId !== null) {
      throw new ImportRefused(409, 'This import has already been reconciled');
    }
    const ledger = await ledgerBalanceOn(tx, account.id, imp.closingDate);
    const difference = roundMoney((toCents(imp.closingBalance) - toCents(ledger)) / 100);
    if (toCents(difference) !== toCents(expectedDifference)) {
      throw new ImportRefused(
        409,
        'The balance changed since you looked; review the difference again',
      );
    }
    if (difference === 0) throw new ImportRefused(409, 'The ledger already matches the statement');

    const [adjustment] = await tx
      .insert(savingsTransactions)
      .values({
        userId: account.userId,
        accountId: account.id,
        type: difference > 0 ? 'deposit' : 'withdrawal',
        amount: Math.abs(difference),
        date: imp.closingDate,
        note: `Adjustment to the statement balance (import ${imp.id})`,
        importId: imp.id,
        importSource: RECONCILIATION_SOURCE,
        externalId: `import-${imp.id}`,
      })
      .returning({ id: savingsTransactions.id });
    await updateSavingsAccountBalanceByDelta(tx, account.id, difference);
    await withLedgerWrite(
      tx,
      { ...account, partnerId: account.userId === scope.userId ? scope.partnerId : scope.userId },
      imp.closingDate,
    );
    await tx
      .update(csvImports)
      .set({ adjustmentTransactionId: adjustment!.id })
      .where(eq(csvImports.id, importId));
    return toProgress(tx, await findImport(scope, importId, tx));
  });
}

// ── Profiles ─────────────────────────────────────────────────────────────────

export async function listProfiles(scope: ImportScope, kind?: CsvImportKind) {
  const rows = await db
    .select()
    .from(importProfiles)
    .where(
      and(
        eq(importProfiles.userId, scope.userId),
        kind ? eq(importProfiles.kind, kind) : undefined,
      ),
    )
    .orderBy(asc(importProfiles.source));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as CsvImportKind,
    source: row.source,
    mapping: row.mapping,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function deleteProfile(scope: ImportScope, profileId: number): Promise<boolean> {
  const removed = await db
    .delete(importProfiles)
    .where(and(eq(importProfiles.id, profileId), eq(importProfiles.userId, scope.userId)))
    .returning({ id: importProfiles.id });
  return removed.length > 0;
}
