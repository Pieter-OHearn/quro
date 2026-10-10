// What the upgrade from the 0.7.0 fixture is allowed to change (docs/upgrade-fixture.md).
//
// verify.ts compares every table of the fixture before and after the upgrade: row counts, a
// checksum of all rows, null counts per column and numeric totals per currency. Any difference
// that is not declared below fails the upgrade test, and so does a table or column that a
// migration adds without an entry here. A pull request whose migration changes existing tables
// or data adds its entry in the same change.
//
// SQL expressions run on the 0.7.0 side, against the table's own row, and must produce the
// value (and type) the upgraded row holds.

export type TableChange = {
  /** The table did not exist in 0.7.0; the number of rows the migrations leave in it. */
  newTable?: { rows: number };
  /** Columns added since 0.7.0, each with the value the upgrade must give existing rows. */
  addedColumns?: Record<string, string>;
  /** Columns a migration rewrites, each with the value it must produce from the 0.7.0 row. */
  rewrittenColumns?: Record<string, string>;
  /** A condition on the 0.7.0 row: only rows that meet it are expected after the upgrade. */
  keptRows?: string;
  /**
   * Rows the migrations add after the 0.7.0 rows, ordered by an integer key. `journal` means one
   * row per migration newer than the fixture, counted from the migration journal.
   */
  appendedRows?: { key: string; count: number | 'journal' };
};

export const CHANGES_SINCE_FIXTURE: Record<string, TableChange> = {
  // The migrator records each migration it applies.
  'drizzle.__drizzle_migrations': { appendedRows: { key: 'id', count: 'journal' } },
  // Sessions are stored as the SHA-256 digest of the cookie token, and record their last use;
  // existing sessions start with their creation time.
  'public.sessions': {
    rewrittenColumns: { id: "encode(sha256(convert_to(id, 'UTF8')), 'hex')" },
    addedColumns: { last_used_at: 'created_at', user_agent: 'null::text' },
  },
  // Single-use registration and password-reset codes.
  'public.auth_codes': { newTable: { rows: 0 } },
};

/**
 * Columns that say where a value came from or how far it can be trusted. Each is compared row by
 * row (by `id`), so a failure names the row; the table checksums cover them as well.
 */
export const PROVENANCE_COLUMNS: Record<string, string[]> = {
  'public.budget_categories': ['currency', 'currency_needs_review', 'expense_class_confirmed'],
  'public.budget_transactions': [
    'currency',
    'currency_needs_review',
    'source_amount',
    'source_currency',
    'source_provider',
    'source_account_id',
    'source_account_name',
    'source_account_type',
    'bunq_transaction_id',
  ],
  'public.currency_rate_history': ['provider', 'source_date', 'updated_at'],
  'public.currency_rates': ['provider', 'source_date', 'updated_at'],
  'public.holding_price_history': ['price_currency', 'synced_at'],
  'public.holdings': ['currency', 'price_updated_at', 'manual_price', 'exclude_from_sync'],
  'public.net_worth_snapshots': ['base_currency', 'is_estimated', 'computed_at'],
  'public.pension_statement_import_rows': ['evidence', 'confidence', 'committed_transaction_id'],
  'public.pension_statement_imports': ['file_hash_sha256', 'model_name', 'model_version'],
  'public.savings_accounts': [
    'currency',
    'bunq_account_id',
    'banking_entity_id',
    'banking_entity_confirmed_at',
    'deposit_guarantee_currency',
  ],
  'public.savings_transactions': ['bunq_transaction_id'],
};

export type AttachmentColumns = {
  table: string;
  key: string;
  size: string;
  sha256?: string;
  /** Rows whose document the application can still read. */
  where?: string;
};

/** Where rows refer to stored documents. Every such document must be in the store afterwards. */
export const ATTACHMENTS: AttachmentColumns[] = [
  { table: 'public.payslips', key: 'document_storage_key', size: 'document_size_bytes' },
  {
    table: 'public.pension_transactions',
    key: 'document_storage_key',
    size: 'document_size_bytes',
  },
  {
    table: 'public.pension_statement_imports',
    key: 'storage_key',
    size: 'size_bytes',
    sha256: 'file_hash_sha256',
    // 0.7.0 sets storage_deleted_at once it has deleted an expired import's file.
    where: 'storage_deleted_at is null',
  },
];
