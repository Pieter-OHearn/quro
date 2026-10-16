# Data export and account deletion

Every account can download its data and delete itself in **Settings → Your data**. Both act on the signed-in account only. This page says what each one covers, what stays behind, and how an operator follows up.

## Export

The export is one ZIP, created while you wait. It is available to every signed-in account; nothing needs to be enabled.

```text
README.txt            What each file holds and how to read it
data/<table>.json     Every row of a table, values exactly as stored
csv/<table>.csv       The same rows as CSV, for spreadsheets
documents/<table>/    Stored documents, named <row id>-<file name>
manifest.json         Format version, row counts, SHA-256 of every file, document list
```

`manifest.json` is the last entry. Its `formatVersion` is `1`; a change that breaks a reader raises it. For each table it gives the row count, the column order and the SHA-256 of the JSON and CSV files, and for each document the row it belongs to, its size and SHA-256. A document that storage no longer holds is listed under `documents.missing`, and its row is still exported.

### What is in it

The account's own rows: profile, employments, planning assumptions, savings accounts and transactions, holdings, transactions and price history, properties, mortgages, their transactions, pensions and their transactions, statement uploads and their rows, debts and payments, payslips, goals, budget categories and transactions, category mappings and monthly net worth snapshots.

- **Joint rows.** Joint accounts, properties and mortgages you own are exported in full, not halved, including ledger rows your partner entered on them (`enteredByPartner` is `true` on those). Rows your partner owns are not exported, joint or not: they belong to their account.
- **Money and currency.** Amounts are numbers in the currency the row names (`currency`, or `sourceCurrency` and `baseCurrency` where a row carries them). Nothing is converted, negative balances and equity keep their sign, and empty values stay empty.
- **Provenance.** Bank-synced rows keep their source fields.
- **Never included:** password hash, sessions, sign-in codes, bank-link credentials, encryption keys and storage keys. Exchange rates, the stock exchange list and background job state are shared reference or housekeeping data, not yours.

### CSV and spreadsheets

CSV follows RFC 4180: UTF-8, comma separated, CRLF line ends, quotes doubled. A spreadsheet runs a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return as a formula, so such **text** gets a leading apostrophe in the CSV (`=HYPERLINK(...)` becomes `'=HYPERLINK(...)`). Numbers are written as they are, so a negative amount stays a number. The JSON files never change a value; use them when you need the exact text.

### Limits and resource use

- One export runs at a time for an account, and two at a time on the instance; another request gets `429` until one finishes or the client disconnects.
- An account with more than 250,000 rows, 2,000 documents or 512 MiB of documents gets `413` before anything is sent. The archive stays within plain ZIP limits (4 GiB, 65,535 entries).
- The rows are read in one read-only transaction, so every table comes from the same moment. They are built in memory, then sent as a stream; documents are read from storage one at a time. Memory holds the tables plus one document.
- Access is checked again before each document. Signing out, ending the session elsewhere or deleting the account stops a running export, and closing the download stops the work after the current entry.

There is no import for this archive yet. Restoring a whole instance is [backup and restore](backup-and-restore.md); the export is for reading, archiving and moving to other tools.

## Deletion

**Settings → Your data → Delete account** asks for your email address and password and shows what will go. It then deletes, in one database transaction, the account and everything it owns: all the rows above, bank links, sessions, sign-in codes and the partner link. An audit row is written in the same transaction; if anything fails, nothing is deleted.

| Data                                                              | What happens                                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your rows                                                         | Deleted. This includes ledger rows your partner entered on your joint accounts, which belong to those accounts.                                                         |
| Your joint accounts, properties and mortgages                     | Deleted, so your partner stops seeing them. The confirmation says how many there are. Export first if your partner needs a copy.                                        |
| Rows you entered on your partner's joint accounts                 | Kept and handed to the partner, because they are part of the ledger behind the partner's balance.                                                                       |
| Your partner's own rows                                           | Untouched. The partner link ends.                                                                                                                                       |
| Stored documents (payslips, pension documents, statement uploads) | Removed from document storage after the transaction commits.                                                                                                            |
| Background work                                                   | Queued and in-progress statement imports and bank sync progress are rows of the account and are deleted with it. A worker that still holds one finds nothing to update. |
| Notifications                                                     | Quro has none.                                                                                                                                                          |
| Cached data                                                       | The browser's cache is cleared on sign-out. The server keeps no per-account cache.                                                                                      |
| Exchange rates and the stock exchange list                        | Shared, not tied to an account; kept.                                                                                                                                   |
| Backups                                                           | **Not changed.** See below.                                                                                                                                             |

The audit row (`account_deletions`) holds the former account id, the time, the number of rows removed per table and what happened to the documents. It holds no name, email, amount or file name. Operators can read it with SQL; it is not exposed in the app.

### Documents the store refused to remove

If the document store cannot delete a file (a storage outage, a permission problem), the account is still deleted. The keys stay on the audit row, and the response tells the user how many are pending. Retry them with:

```sh
docker compose exec backend quro documents retry-deleted
```

It exits `0` when none are pending and `1` when some still fail. Run it again after fixing the store.

### Backups keep the account

Deleting an account changes the live database and document store only. A backup taken earlier still holds the account until you delete that archive, and a restore brings the account back, including the deleted documents. Archives are immutable: Quro does not edit them.

- Keep backups only as long as you need them; `QRO_BACKUP_KEEP` and your off-device retention set that ([backup and restore](backup-and-restore.md#encrypt-archives-and-copy-them-off-the-device)).
- Delete archives made before the deletion if the person must be gone from every copy.
- After a restore, delete the account again if it was deleted after the backup was taken. The audit table is restored with the backup, so it does not help here: keep your own record of deletions you owe.

### Removed bank details

`budget_transactions.bunq_mcc`, `bunq_payment_type` and `counterparty_iban` were written on every bank sync and read by nothing. A migration drops them, so take a backup before upgrading: the values exist only there afterwards. Sync still uses the counterparty IBAN and merchant category it receives, in memory, to recognise transfers between your own accounts and to pick a category.
