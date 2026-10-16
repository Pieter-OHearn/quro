# Import a CSV

For an account without bank linking, a CSV export from your bank is the way to bring transactions in. A file never writes to your ledger directly: you map its columns, review every row in a dry run, and only the rows you approve are written, in small batches that can be stopped and resumed.

Two kinds of file are supported:

- **Savings.** Rows become deposits and withdrawals on one savings account you choose. Open the account on the Savings page and choose **Import CSV**. Accounts synced from bunq cannot be imported into.
- **Budget.** Rows become budget expenses, grouped by category and month. Choose **Import CSV** on the Budget page.

Reconciliation beyond the checks below (matching one row against another account, transfers between accounts, undoing a finished import) is not part of this release.

## The steps

1. **Choose a file.** Quro reads the header and a few rows and guesses the columns.
2. **Match the columns.** Name the source (for example `Bank current account`), pick the columns, the date format and the decimal separator. Quro can remember the mapping for the source, so the next file from it needs no matching.
3. **Review.** A dry run shows every row as ready, already imported, a possible duplicate, skipped or an error, with the reason. Nothing has been written yet. Only checked rows are imported, and ready rows start checked.
4. **Import.** The approved rows are staged, then written in batches. You can cancel between batches. If the connection drops or the tab closes, open the import again later and resume it.

## The file

A CSV file with a header row, up to 2 MB, 5,000 rows and 50 columns, and at most 2,000 characters in a cell. Comma, semicolon, tab and pipe delimiters are detected, quoted cells may hold delimiters, quotes and line breaks, and UTF-8 (with or without a byte order mark) or Windows-1252 text is read. Columns are matched by header name, never by position, so a saved mapping fits any file with the same headers. A larger file is split by the person importing it.

| Column                | Needed       | Meaning                                                                                                              |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Date                  | yes          | The booking date.                                                                                                    |
| Description           | yes          | Text for the transaction. A budget import can use a merchant column instead.                                         |
| Amount                | one of these | One signed column: money in is positive, money out negative. "The file writes money going out as positive" flips it. |
| Debit and credit      | one of these | Two columns, each read as a size: a debit is money out, a credit money in. A row with both is an error.              |
| Currency              | no           | A currency code per row. Without it the currency chosen for the file applies.                                        |
| Bank id               | no           | The bank's own id for the row, used to find rows already imported.                                                   |
| Running balance       | savings, no  | Used to find the statement's closing balance (see [Balance check](#balance-check)).                                  |
| Category and merchant | budget, no   | The category name and merchant of an expense.                                                                        |

**Amounts** are read in the notation you choose: with a dot as the decimal separator `1,234.56`, with a comma `1.234,56`. A minus or plus sign before or after, accounting brackets `(12.50)`, spaces, a currency symbol or code are accepted. Anything else is a row error and nothing is guessed: an exponent, hex, a grouping that is not by three, a second decimal separator, and more than two decimals (`12.345` is refused, never rounded). Amounts are whole cents, below 10^13, and zero is an error.

**Dates** are read in the format you choose: `YYYY-MM-DD`, `YYYY/MM/DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YYYY` or `DD.MM.YYYY`. With **Detect from the file** the file must settle the question: a file whose dates all fit both `DD/MM/YYYY` and `MM/DD/YYYY` (every day 12 or lower) is refused until you choose, and so is a file whose dates do not share one format. Impossible dates such as 31 February are row errors. Dates are calendar dates and never shift with a time zone.

**Currencies.** A savings account keeps one currency: a row in another currency is an error, never converted. A budget row in another currency is converted to EUR at the stored rate and keeps its original amount and currency. A currency without a usable rate fails the row; no rate is invented.

**Text** is stored as plain text with control characters removed and white space collapsed. Text that starts with `=`, `+`, `-` or `@` stays as it is and is flagged in the review; it is never evaluated, and [exports](data-export-and-deletion.md#csv-and-spreadsheets) write it with a leading apostrophe so a spreadsheet does not run it. A leading apostrophe that an export put in front of such text is taken off again.

## Duplicates and repeating an import

Every row has a key made of the **source** you name and an **external id**: the bank id column when you map one, otherwise a digest of the row's date, signed amount, currency and description plus the number of identical rows before it in the file. For a savings account the key is unique per account; for the budget it is unique per person. So:

- importing the same file again finds every row **already imported** and offers nothing to write;
- two identical purchases in one file (two coffees on one day) are both imported, and both found again next time;
- two imports running at once write each row once: the unique key turns the loser's rows into duplicates and only rows actually written change a balance;
- a repeated bank id inside one file counts once.

A row with the same date and amount as a row already in the ledger, entered by hand or synced, is a **possible duplicate**. It starts unchecked; check it if it is really a second payment.

Deleting an imported row removes it from the ledger like any other row, and a later import of the same file adds it again.

## Batches, cancelling and resuming

The approved rows are stored first, without touching the ledger. They are then written at most 200 rows per request, each batch in one transaction, so a crash or a closed tab leaves whole batches only. Cancelling stops after the current batch: rows already written stay and carry the import's id, nothing more is written. Resuming (or opening a failed import again) continues from the rows still pending. A finished or cancelled import can be read from the API for as long as it exists; staged rows that were never committed do nothing.

## Balance check

For a savings import Quro compares the statement's closing balance with the ledger on the same date. The closing balance is the running balance of the last dated row, when the rows of that day chain one into the next; otherwise enter the balance and its date yourself. The ledger balance is the account balance minus what was booked after that date, so rows dated after the statement do not disturb the comparison. The review shows the difference you would have once the ready rows are in, and the finished import shows it again against the real ledger.

A difference is a signal, not an error: a row may be missing, repeated or wrong, or the account balance may have started from a different figure. Check the rows first. If the difference is right to keep, **Book the difference as an adjustment** writes one labelled deposit or withdrawal dated the statement's closing date. It sends the difference you were shown; if the ledger moved since, nothing is written and you are asked to look again. An import has at most one adjustment.

A budget has no balance, so there is nothing to reconcile there; the review shows each row's category and month instead.

## Provenance

Rows written by an import carry `importId`, `importSource` and `externalId`, visible in the API and in [exports](data-export-and-deletion.md), and savings rows show an **Imported** badge. The staged rows, mappings and import records are part of your data: they are exported, and deleted with the account.

## Access

Everything is derived from the signed-in account. A request names an account or an import only by id, and an id you cannot reach answers exactly as one that does not exist, in preview, review and error messages alike. You can import into your own accounts and your partner's joint accounts, as for a manual entry: the rows belong to the account's owner. A partner's private account, an archived account and a bunq-synced account refuse. Imports and mappings are private to the person who made them. Writes pause while a backup or restore runs, like every other change.

## Interfaces

All routes are under `/api/imports` and need a signed-in session and the CSRF header like any change.

| Route                                           | Does                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /csv/headers`                             | Reads the header, a sample, the delimiter and a column and decimal-separator guess.      |
| `POST /csv/preview`                             | The dry run. Writes nothing.                                                             |
| `POST /csv`                                     | Stages the approved rows (`selectedRows`) of the file that was previewed (`fileSha256`). |
| `POST /csv/:id/commit`                          | Writes the next batch and answers with progress. Repeat until `pending` is 0.            |
| `POST /csv/:id/cancel`                          | Stops a staged import.                                                                   |
| `POST /csv/:id/reconcile`                       | Books the difference you were shown as one adjustment.                                   |
| `GET /csv`, `GET /csv/:id`, `GET /csv/:id/rows` | Lists imports, shows one with its balance check, lists its rows and outcomes.            |
| `GET /profiles`, `DELETE /profiles/:id`         | Lists and removes saved mappings.                                                        |
