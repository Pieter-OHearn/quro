# Changelog

All notable changes to this project will be documented in this file. The format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses [Semantic Versioning](https://semver.org/) for release numbers.

## [Unreleased]

### Changed

- **Breaking:** a property and its mortgage keep separate ledgers. A property records valuations, rent income and expenses; a mortgage records repayments and rate changes. Each refuses the other's types, and each page lists the other's rows read-only with a link to the page that edits them, so a property card now counts and lists its mortgage's repayments. The property, mortgage and transaction APIs change accordingly ([upgrade notes](docs/upgrade.md#upgrade-from-100-rc5-to-100-rc6)).
- **Breaking:** a property's only debt is its linked mortgage. A balance typed on the property itself is no longer kept, and the mortgage reads the property's address and value instead of keeping copies.
- A property valuation sets the property's current value, and the property's equity is worked out on the server, so the property card, the mortgage page and the dashboard show the same figure.
- Recording a repayment suggests the date, a note, the amount and the interest and principal split from the loan type, the rate in effect and the balance; every field stays editable. A linear mortgage's current payment is worked out from today's balance.

### Fixed

- The net worth history counted a mortgage's current balance for the months before its repayments, overstating debt in the past; it now adds back the principal the mortgage's repayments paid after each point. A valuation recorded on the mortgage page changed nothing; valuations now belong to the property.

### Upgrade notes

- **Migration `0046_property_mortgage_ledger_ownership`** moves existing rows to the ledger that owns them and drops the columns that let each ledger hold the other's rows. Take a backup first: going back means restoring it. Rows it cannot assign stop the migration with their ids and change nothing; run the read-only count in the [upgrade notes](docs/upgrade.md#upgrade-from-100-rc5-to-100-rc6) before you upgrade.

## [v1.0.0-rc.5] - 2026-10-29

Quro 1.0.0-rc.5 adds an optional single sign-on only mode, so the provider can be the only way in, and fixes more phone layout problems. The new mode is off by default, there is no migration, and Quro behaves like rc.4 until you turn it on. Read the [upgrade notes](docs/upgrade.md#upgrade-from-100-rc4-to-100-rc5) before you turn it on.

### Added

- `QRO_PASSWORD_LOGIN` (default on). With it off and single sign-on configured, password sign-in, sign-up with a registration code, password reset and password change are refused with a fixed message, the sign-in page shows only the provider button, and the backend refuses to start if single sign-on is not configured. Your stored passwords stay, so switching it back on restores password sign-in.
- `quro user create EMAIL` creates an account without a password, linked at its first provider sign-in by verified email address. `quro user status` shows the mode, and `quro user invite` and `reset-password` refuse while passwords are off.
- `quro doctor` has a `signin` check that reports the mode and warns when passwords are off and the provider cannot be reached.

### Changed

- While passwords are off, deleting your account needs the typed email address and a provider sign-in from the last ten minutes, and the Settings unlink control is replaced by `quro user oidc unlink EMAIL --yes`.
- Linking a provider identity by email address is allowed in `open` registration mode when passwords are off, because nobody can register then.

### Fixed

- On an iPhone, date, month and time fields keep the shared field style instead of the system's native look, the page scrolls back to the top after the keyboard closes, and pension pots show as phone cards like savings accounts and holdings.

### Security

- Updated dependencies for published advisories: hono, follow-redirects, vite, ip-address, body-parser, qs, zod, fast-uri and @hono/node-server, and Pillow 13.0.0, pypdf 6.21.2, FastAPI 0.162.0 and Starlette 1.10.0 in the optional statement import service. The frontend image installs the fixed Alpine packages (brotli, curl and expat) that an earlier cached build step had skipped.

### Upgrade notes

- No migration. Pin the new images and restart; going back to 1.0.0-rc.4 needs no restore.
- To turn passwords off, check that everyone can sign in with the provider first. If the provider is ever unavailable, set `QRO_PASSWORD_LOGIN=true` and recreate the backend with `docker compose up -d backend`; a plain restart does not re-read the environment file.

## [v1.0.0-rc.4] - 2026-10-18

Quro 1.0.0-rc.4 adds the Exposure tab on the Plan page: how your investments are spread, described against editable reference mixes. It is information, not advice, and it has one additive migration. Read the [upgrade notes](docs/upgrade.md#upgrade-from-100-rc3-to-100-rc4) before you upgrade.

### Added

- The Plan page has tabs, linked as `?tab=runway` and `?tab=exposure`. The new **Exposure** tab describes how your brokerage holdings are spread: one bar for stocks, bonds, cash and other assets with the range of a reference mix drawn over it, a plain sentence such as "Bonds are 62% of your investments", a weighted average risk class on the 1 to 7 scale, breakdowns by asset class, currency, sector and holding with the effective number of holdings, and notices where one holding, three holdings, a sector or a currency passes a threshold. It is information, not advice. A **How this is worked out** panel lists the method, the defaults in use, their sources and version dates. [Details](docs/exposure-facts.md)
- Each holding has an optional **asset class** and a fund's own **risk class** (1 to 7), set on the holding form or, for several holdings at once, on the Exposure tab. A suggestion from the name, sector and type is shown but never saved for you; holdings without a class are shown as Unclassified.
- **Customise** (also linked from Settings → Preferences) changes the default risk class of each asset class, the four reference mixes (Reference mix A to D), the mix drawn on the chart (none by default) and the concentration thresholds, with a switch for each notice and a reset to the defaults. The notice for one currency other than EUR is off by default; the currency breakdown is always shown. Settings are validated, versioned and stored per account.
- `GET /api/exposure` returns the facts behind the page (each with its inputs, method and settings version) and the breakdowns derived from them; `PUT` and `DELETE /api/exposure/settings` and `PATCH /api/exposure/classification` change the settings and the classes. Nothing is sent to any service.
- The demo household has holdings in every asset class, a USD and a GBP position, one large position and two unclassified holdings.

### Upgrade notes

- **Migration `0045_exposure_classification`**: it adds `holdings.asset_class` and `holdings.risk_class_override` (both empty for existing holdings) and the `exposure_settings` table. It drops nothing and changes no existing row; 1.0.0-rc.3 refuses to run against a database that has it, so going back means restoring your pre-upgrade backup, which the general procedure takes first; the account export and deletion include the new table.

## [v1.0.0-rc.3] - 2026-10-18

Quro 1.0.0-rc.3 adds optional sign-in through an OpenID Connect provider. It is off until you set the `OIDC_*` settings, passwords keep working, and it has one additive migration. Read the [upgrade notes](docs/upgrade.md#upgrade-from-100-rc2-to-100-rc3) before you upgrade.

### Added

- Sign in through an OpenID Connect provider such as Authelia, Keycloak or Google, next to passwords ([Single sign-on](docs/configuration.md#single-sign-on)). The flow is the authorization code flow with PKCE, state and a nonce. A provider sign-in never creates an account: the first sign-in links the provider's identity to the account with the same verified email address, and later sign-ins match the provider's subject.
- `quro user oidc status EMAIL` and `quro user oidc unlink EMAIL --yes` show and remove a link, and Settings → Security has a Single sign-on card that unlinks after a password check. The next provider sign-in links the account again.
- The personal data export includes the account's provider link (issuer and subject).

### Fixed

- A wrong password when you change your password, delete your account or unlink single sign-on shows the field error and keeps you signed in, instead of sending you to the sign-in page as if the session had ended.

### Security

- The ID token's signature is verified against the provider's published keys, with an allowlist of asymmetric algorithms (RS256, PS256, ES256, EdDSA); the issuer, audience, expiry, nonce and authorized party are checked. Provider requests need `https` (plain `http` only for a loopback provider), are size-limited and time-limited, and do not follow redirects.
- Sign-in routes pause while a backup or restore holds the maintenance lock, and logs carry only an error class for provider failures, never a token, code or address.

### Upgrade notes

- **Migration `0044_oidc_sign_in`** adds the `oidc_identities` and `oidc_login_attempts` tables and changes no existing row. Quro 1.0.0-rc.2 does not ship it and refuses to run against a database that has it, so going back after the upgrade means restoring the backup you took before. Take one first, as in the general procedure.
- **Nothing else to do** unless you want single sign-on; then register Quro at your provider and set the `OIDC_*` settings.

## [v1.0.0-rc.2] - 2026-10-17

Quro 1.0.0-rc.2 fixes how Quro looks when it is opened from an iPhone's home screen. It has no migration and needs no operator action beyond pinning the new images; see the [upgrade notes](docs/upgrade.md#upgrade-from-100-rc1-to-100-rc2).

### Fixed

- Opened from a phone's home screen, the app header, the navigation drawer, the landing page and the currency rates screen clear the faded strip below the status bar, so the top of the currency selector is drawn in full.
- The tab bar and the page above it use half the bottom safe-area padding, so the labels sit closer to the bottom edge while still clearing the home indicator.

## [v1.0.0-rc.1] - 2026-10-16

Quro 1.0.0-rc.1 is the release candidate for 1.0.0. It adds account export and deletion, a reviewed CSV import, first-run guidance, structured logs and operational checks in `quro doctor`, bounded text fields, and a phone layout with cards, accessible charts and honest stale-data notices. Read the [upgrade notes](docs/upgrade.md#upgrade-from-090-to-100-rc1) before you upgrade, and back up with 0.9.0 first: one migration drops columns and cannot be undone.

### Breaking changes

Each item needs action from some operators or API clients and links to what to change in the upgrade notes.

- **Migration 0042 drops three unused `budget_transactions` columns, `bunq_mcc`, `bunq_payment_type` and `counterparty_iban`.** Their values exist only in a backup afterwards, and the older image cannot run on the upgraded database. Back up with 0.9.0 first. [Details](docs/upgrade.md#migrations-and-the-backup-to-take-first)
- **Server and import worker logs are JSON lines, not bracketed text.** Anything that parses the old lines (a log collector, an alert rule) must change. Responses carry an `X-Request-Id` header, and error messages are no longer logged. [Details](docs/upgrade.md#json-logs-and-request-ids)
- **`quro doctor` checks more and reports a new `unknown` status.** A stopped core job, a referenced document missing from the store or a nearly full disk now makes it exit with code 1, and a script that reads each check's `status` must accept `unknown`. [Details](docs/upgrade.md#doctor-checks-and-the-unknown-status)
- **`GET /api/capabilities` no longer has an `ai` key, and every capability has a `lifecycle` field.** Use `pensionStatementImport` where a client read `ai`. [Details](docs/upgrade.md#capabilities-and-the-setup-endpoint)
- **The API answers `400` for a text value over its length limit.** Names and labels are limited to 100 characters, descriptions to 500, notes to 2000 and emails to 254. A value that is already longer stays editable while that field is left unchanged. [Details](docs/upgrade.md#text-field-length-limits)

### Added

- Every account can download its data in **Settings → Your data**: one ZIP with JSON and CSV for each table, the stored documents and a manifest with row counts and SHA-256 hashes (`GET /api/settings/export`). Text that a spreadsheet would run as a formula is escaped in the CSV. [Details](docs/data-export-and-deletion.md#export)
- Every account can delete itself there (`DELETE /api/settings/account`, with the password and the email address). The rows, bank links, sessions and stored documents go in one step, an audit row (`account_deletions`) records the counts without personal data, and `quro documents retry-deleted` removes documents the store refused to delete. Backups are not changed. [Details](docs/data-export-and-deletion.md#deletion)
- A savings account or the budget can import a bank's **CSV** with a reviewed flow: map the columns once (the mapping is remembered per source), review every row in a dry run with locale, date and currency handling, and write only approved rows in bounded batches that can be cancelled and resumed. Rows already imported are found again by a `(source, external id)` key, so repeating an import adds nothing, and a savings import compares the statement's closing balance with the ledger and can book the difference as one labelled adjustment. [Details](docs/csv-import.md)
- A getting started card on the dashboard guides a new household through currency and number format, what is shared with a partner, the first account and the first transaction, and goes away once there is an account and a transaction. `GET /api/dashboard/setup` returns `hasAccount` and `hasTransaction` for it. [API changes](docs/upgrade.md#capabilities-and-the-setup-endpoint)
- Settings → Connections lists the features on this server with whether each is on, why not, and an experimental badge for statement import, instead of a fixed "Coming soon" list. The bunq Connect button and the statement import button are not shown on a server where that feature is not set up.
- `quro doctor` reports background job lag and failures, data freshness, disk space, the age of the newest backup and whether referenced documents are in the store, with a new `unknown` status for anything without evidence. [Monitor an install](docs/operations.md)
- Notices say when the data behind a figure is not current: an exchange rate older than 48 hours (with the currencies and the date), a holding whose synced price is older than a week, and a failed load of archived items, spending classes, banking entities or price history, each with a Retry where one applies. A failed load is never shown as an empty list.
- Every chart has a text summary and a **Show values** table of the exact plotted values, including negative, missing and estimated entries. Charts follow the system reduced-motion setting, label axes in a compact form that fits a phone, keep tooltips inside the screen, and draw each series with a dash, fill or outline as well as a colour. Click a chart or tab to it and use the arrow keys to read a value.
- Salary compares a payslip with the previous one, or with any other, in a gross-to-net table with a change column, and shows a year total row. An expanded holding shows its position (price, average cost, market value, cost basis, unrealized and realized gain) in the holding's currency and in your base currency, with the price source and a **Correct holding** button. Payslips and active holdings page at 25 rows.
- On a phone, tables can be sorted and rows reveal their other figures with **Show details**; the brokerage holdings, the payslip history, savings accounts, closed holdings and properties are cards. Dialogs and the navigation drawer trap focus and return it, forms scroll to the first error and stay usable above the on-screen keyboard, and the app remembers its scroll position per page.

### Changed

- A failed background job waits a minute, then two, and so on up to its interval before it retries, instead of retrying at every poll. [Details](docs/upgrade.md#background-job-backoff)
- Free-text fields have a maximum length, and the web inputs stop at the same length. No migration. [Limits](docs/text-limits.md)
- On a phone, the dashboard puts net worth before the getting started list, Savings shows its total across the full width, and the stat cards use the shorter labels Salary, Dividends and Property equity. The Plan page shows the runway figure before the employment and spending class cards. Below 360px the currency button drops its flag and chevron so the page title fits.
- Stored values that were saved in Title Case (savings account types, pension types, property types, asset allocation names, the generic rule set) are shown in sentence case. The stored values and the API are unchanged.
- The select arrow sits 12px from the edge with room for long options, and table rows with a caption under the first line have room to breathe.
- Statement import copy no longer says "AI". The feature is marked experimental.

### Fixed

- The app header, the navigation drawer, the landing page and the currency rates screen no longer slide under the status bar and notch when Quro is opened from a phone's home screen.
- The goals at a glance bars end at the same point and their badges share one column.
- The Brokerage value figure and the other stat cards shrink to fit their card instead of running out of it on a narrow phone, and a change under a figure wraps instead of running past the card.
- A transaction row puts its Edit and Delete buttons on a line of their own below 360px, so the label stays readable.
- Settings opened on a tab that a scrolled tab group had clipped now shows the tab.

### Security

- Logs and trace spans no longer contain error messages or stacks, only the error class and codes, and fields whose names look like credentials or personal data are redacted.
- Free-text fields in the API are bounded in length.
- CSV exports escape text that a spreadsheet would run as a formula, and CSV import reads a file within fixed limits (2 MB, 5,000 rows, 50 columns) and never evaluates a cell.

## [v0.9.0] - 2026-10-15

Quro 0.9.0 hardens the containers, encrypts bank-link secrets at rest, bounds statement processing, adds net worth chart ranges and brings the new design to every page, for laptop and phone, in light and dark mode. Read the [upgrade notes](docs/upgrade.md#upgrade-from-080-to-090) before you upgrade, and back up with 0.8.0 first.

### Breaking changes

Each item needs action from some operators and links to what to change in the upgrade notes.

- **A secrets key is required when bunq is configured.** Create a key file, mount it into `migrate` and `backend` (`QRO_SECRETS_KEY_FILE`, default `/run/secrets/secrets_key`; `quro init` creates one) and run `quro secrets encrypt` once while the backend is stopped. Without the key the backend stops at startup with exit code 2. [Details](docs/upgrade.md#secrets-key-for-bank-links)
- **PostgreSQL 18 is the only supported server.** `quro migrate`, `quro doctor`, `quro backup` and `quro restore` refuse any other major version with exit code 3, before they change anything. [Details](docs/upgrade.md#postgresql-18-required)
- **Settings that 0.8.0 retired are no longer recognised.** `DATABASE_HOST`, `DATABASE_PORT`, `APP_DB_USER`, `APP_DB_PASSWORD`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_APP_PASSWORD`, `MINIO_APP_USER` and `S3_SECRET_ACCESS_KEY` are ignored like any unknown variable, and `quro doctor` no longer lists them. Run `quro doctor` with 0.8.0 and remove what it reports. [Details](docs/upgrade.md#settings-of-releases-before-080)
- **The statement import Compose profile is renamed from `pension-import` to `ocr`.** A checkout that starts statement import uses `docker compose --profile ocr`, and `data/vllm-cache` must be owned by UID 1000 because the model server no longer runs as root. The example install does not include statement import. [Details](docs/upgrade.md#statement-import-profile)
- **The images declare health checks.** Services that run the backend image for something other than the server (the `migrate` service, the import worker, a scheduled backup or other one-off maintenance services) need `healthcheck: disable: true`, or Docker reports them unhealthy. [Details](docs/upgrade.md#container-hardening)
- **The frontend runs as a non-root user and ignores files mounted over `/etc/nginx/conf.d`.** Its configuration is rendered into `/tmp/nginx/conf.d`. The restrictions in the example Compose file (read-only root filesystem, dropped capabilities, limits) need the 0.9.0 images. [Details](docs/upgrade.md#container-hardening)

### Added

- Bank-link secrets are encrypted at rest with a key that only you hold. New commands `quro secrets status`, `quro secrets encrypt` and `quro secrets rotate` check, encrypt and rotate it. `quro init` generates the key for new installs, the example Compose file mounts it, `quro doctor` has a `secrets` check, and a backup reports which key its bank links need.
- When stored bank credentials cannot be opened, bunq sync asks you to reconnect (`409` with `code: bunq_reauthorization_required`) instead of failing, without calling bunq.
- Container hardening in the [example Compose file](docs/compose.example.yaml): read-only root filesystems, dropped capabilities, `no-new-privileges`, and memory and process limits. The backend image contains production dependencies only and is smaller.
- Net worth chart ranges: 1M with one point a day, 6M, 1Y and All, from your first dated record and at most 30 years back. `GET /api/dashboard/net-worth` takes a `range` (`1m`, `6m`, `1y` or `all`; `6m` when absent) and every point carries its `date`. See the [API changes](docs/upgrade.md#api-changes).
- Limits on statement processing: file size, pages, page pixels, extracted text, concurrency and queue length, with fixed refusal messages. Each PDF is read in a resource-limited child process that is stopped at the time limit. The parser and model services run non-root on an internal network with resource limits. New optional settings `PARSER_MAX_FILE_MB`, `PARSER_MAX_PAGES`, `PARSER_MAX_PAGE_PIXELS`, `PARSER_MAX_TEXT_CHARS`, `PARSER_TIMEOUT_SECONDS`, `PARSER_CPU_SECONDS`, `PARSER_MEMORY_MB`, `PARSER_MAX_CONCURRENCY` and `PARSER_MAX_QUEUE`. [Details](docs/upgrade.md#statement-import-profile)
- The new design: a denser, calmer look for every page, with a bottom tab bar and touch-sized controls on phones, light and dark themes, compact tables, and charts on one palette. See the [design guide](docs/design-v1.md) and the screenshots in the [README](README.md).
- A synthetic demo household (`db:seed-household`) with a linked partner, private and joint rows, a monthly rate history and confirmed banks, for screenshots and manual checks.
- Documentation: supported versions, severity targets and triage in `SECURITY.md`, the design token guide and reference screenshots.

### Changed

- Every page uses the new design. Copy is in sentence case; money in shows with a plus in the gain colour and money out or a negative amount with a true minus (`−€612.75`); percentages show two decimals in your number format; category colour pickers offer the six chart colours (saved colours still display, and the old alert and expense colours show as terracotta); over-target goals keep their warning colour; modals are a bottom sheet on phones; the chart range control sits below the chart on phones; the partner section in Settings and the landing headline are restyled. Colours are checked for contrast in both themes and every focusable control has a focus ring.
- Disconnecting bunq in Settings asks for confirmation first.
- The dashboard's year to date change measures from 1 January (the previous year end), or from your first month when your records start this year, and has no percentage when that starting value is zero or negative.
- Holding prices (current, manual, transaction and price history) are stored with six decimals instead of two, and unit prices show up to four decimals. Dividend amounts and other money stay at two decimals. No operator action; `quro migrate` widens the columns.
- Pages and the dashboard share one set of domain rules: a holding's shares never go below zero, an oversell nets against later buys, rental counts as an investment property, joint rows use one household share, and money totals are summed in whole cents so pages and dashboard agree to the cent.
- A cancelled or failed statement import deletes its PDF when it ends. Imports that ended before the upgrade are not touched.
- `GET /api/pensions/imports` answers 400 for an invalid `limit` instead of falling back to 30, and malformed upload bodies answer 400 `Invalid upload` instead of 500. See the [API changes](docs/upgrade.md#api-changes).
- The JSON output of `quro version --json`, `quro migrate --status --json`, `quro doctor --json` and the readiness report carries no stability promise before 1.0.0.
- Release notes link to the files of the tag they describe, and CI scans the images, Dockerfiles and commit history for known vulnerabilities and secrets, on every change and weekly for the published images.

### Fixed

- Editing or deleting a repayment that the zero-balance limit cut short restores exactly what it reduced, and a property repayment is reversed against the debt it paid, even after the property is linked to a mortgage or remortgaged.
- A cascade archive no longer deadlocks with a concurrent edit of one of its transactions; the edit answers 404.
- Two imports of the same pension statement can no longer both be committed; the second answers 409. `quro migrate` stops with a list of import ids if the database already holds such duplicates. [Details](docs/upgrade.md#duplicate-statement-imports)
- The runway's tax rate is stable when payslips share a date, and its rule date lists the default tax rate only when that rate is used (`jurisdiction.rulesEffectiveFrom` can be `null`).
- A mortgage without a fixed-until date no longer breaks its page, and the web app no longer calls bank or statement import routes that a deployment has switched off.
- `quro backup` and `quro restore` check the PostgreSQL version before pausing writes or writing anything.

### Security

- Bank-link tokens and keys are stored as authenticated, encrypted values bound to their table, column and owner; backups hold only the encrypted form. Query strings and database error text no longer appear in bank-link error messages or logs.
- The frontend runs without root privileges, the backend image contains production dependencies only, and the example Compose file restricts capabilities, privileges and resources.
- Statement PDFs are read in an isolated, resource-limited process, and malformed uploads are refused with a fixed message.
- CI scans images, Dockerfiles and commits and fails on critical findings or any secret; `SECURITY.md` states which versions are supported and how findings are triaged.

## [v0.8.0] - 2026-10-12

Quro 0.8.0 is the first release that a new self-hoster can install from the published images, and the first with a tested upgrade path from 0.7.0. It changes how Quro is configured, started, stored and backed up, and moves the database to PostgreSQL 18. Read the [upgrade notes](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#upgrade-from-070-to-080) before you upgrade, and back up first.

### Breaking changes

Each item needs action from some operators or API users and links to what to change in the upgrade notes.

- **Auto-updater removed.** Releases no longer include the `quro-auto-updater` image, `docker-compose.release.yml` or the auto-update bundle. If you ever ran the updater, stop and remove it before upgrading. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#auto-updater-removed)
- **Backend image entry point is `quro`.** The server is `quro serve` (the default command), the import worker `quro worker pension-imports` and migrations `quro migrate`. `bun run start`, `run-migrate.sh` and the other shell wrappers are gone, so Compose files that set `entrypoint:` or a `bun` command must change. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#backend-image-entry-point)
- **Backend runs as UID 1000, not root.** On Linux the documents directory, the backup directory and the secret files must be readable and writable by that user, or the service needs a matching `user:`. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#backend-runs-as-uid-1000)
- **Frontend requires `QRO_API_URL`.** The backend address is no longer built in; without `QRO_API_URL` (for example `http://backend:3000`, without a path) the frontend container stops at startup. Its nginx configuration is now rendered from a template. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#frontend-api-url)
- **Database settings renamed or retired.** `POSTGRES_HOST` is required (there is no default `db`); passwords come only from files (`POSTGRES_ADMIN_PASSWORD_FILE`, `POSTGRES_APP_PASSWORD_FILE`); `DATABASE_HOST`, `DATABASE_PORT`, `APP_DB_USER`, `APP_DB_PASSWORD`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_PASSWORD` and `POSTGRES_APP_PASSWORD` are no longer read. `POSTGRES_PORT` is honoured and `POSTGRES_SSLMODE` is new. `quro migrate` stops unless the owner role owns the database (or is a superuser) and the server runs PostgreSQL 16, 17 or 18. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#database-settings)
- **S3 settings renamed or retired.** `MINIO_APP_USER` becomes `S3_ACCESS_KEY_ID`; `S3_SECRET_ACCESS_KEY` becomes the file setting `S3_SECRET_ACCESS_KEY_FILE` (default `/run/secrets/s3_secret_access_key`, previously `minio_app_secret_key`); `S3_ENDPOINT` and `S3_REGION` have no defaults; `S3_INTERNAL_ENDPOINT` is not read. All S3 settings are required together. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#s3-settings)
- **Documents are stored on the filesystem by default.** Installs that keep documents in S3 set `QRO_DOCUMENT_STORAGE=s3`; S3 settings without it stop every command with exit code 2, which includes a `.env` carried over from 0.7.0. To move to the filesystem, run `quro documents migrate-from-s3`, then set `QRO_DOCUMENT_STORAGE=filesystem`. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#document-storage)
- **No Compose file is released, and the repository's Compose file no longer runs MinIO.** `docs/compose.example.yaml` is the reference to copy. The repository's `docker-compose.yml` drops `minio`, `minio-init` and their secrets (override files that refer to them fail), runs `migrate` and the import worker with `command:` instead of shell entry points, mounts `./data/documents` into the backend, the import worker and `db-tools`, and mounts `./backups` at `/var/lib/quro/backups` in `db-tools`. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#bundled-compose-file)
- **Invalid settings stop startup.** Malformed numbers and switches no longer fall back to defaults: `PORT`, `SESSION_CLEANUP_INTERVAL_MS`, `PENSION_PARSER_TIMEOUT_MS`, `IMPORT_DRAFT_TTL_DAYS`, `IMPORT_WORKER_POLL_INTERVAL_MS` (at least 500), `S3_FORCE_PATH_STYLE`, `FRONTEND_ORIGIN` and the tracing settings are checked, and `SECURE_COOKIES` and `OTEL_SDK_DISABLED` accept only `true` or `false`. `BUNQ_SANDBOX=1`, `yes` or `TRUE` selected the production bunq API in 0.7.0 and select the sandbox now. A partial set of bunq or S3 settings stops startup. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#strict-settings)
- **`PENSION_PARSER_URL` has no default.** Statement import is off, and its endpoints answer 404, until it is set. The repository's Compose file still sets it. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#statement-import-parser-url)
- **Unconfigured bunq answers 404, not 503.** The `/api/bunq` routes exist only when bunq is fully configured; `GET /api/capabilities` says why. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#bunq-endpoints)
- **PostgreSQL 18 is the baseline.** The repository's Compose file starts `postgres:18.6` in a new data directory, `./data/postgres-18`, so an install that only pulls the change starts an empty database. Move PostgreSQL 16 or 17 data with a dump and a restore into the new directory. Restoring into a PostgreSQL 16 server with the image's tools is not supported. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#postgresql-18)
- **Registration is invite-only by default.** The first account on a new instance needs a setup code (`quro user invite`), and later accounts need an invite code unless `QRO_REGISTRATION_MODE` is `open`. `POST /api/auth/signup` takes an `inviteCode` and answers 403 without a valid one. Existing accounts are unaffected. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#registration-invite-only)
- **Public auth endpoints accept only JSON.** Sign-in, sign-up and password reset answer 415 to other content types. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#auth-json-only)
- **`TRUSTED_PROXIES` defaults to `172.16.0.0/12`** in the repository's Compose file and in `quro init` (the 0.7.0 Compose file trusted every private range). Docker networks or reverse proxies outside that range need an explicit value, or all browsers share one rate-limit key. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#trusted-proxies-default)
- **Ledger list endpoints are paged.** They return `{ data, nextCursor }` with 100 rows by default (at most 1000 with `limit`); holding price history requires `from`. API clients must follow `nextCursor`. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#paged-list-endpoints)
- **Money input is rounded to cents and bounded.** Amounts with more than two decimals are rounded when parsed, minimums are checked after rounding, and amounts of 10^13 or more answer 400. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#money-input-limits)
- **Repeated or conflicting ledger writes answer differently.** A second delete of the same row answers 404, a transaction that moved to another account answers 409, and committing a statement import twice answers 400. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#ledger-write-status-codes)
- **Readiness checks the schema and the configured document store.** `GET /api/readiness` answers 503 while migrations are pending (run `quro migrate`), when the schema is newer than the image, or when the documents directory is unusable; it no longer requires S3. [Details](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#readiness-checks)

### Added

- `quro` commands in the backend image: `init`, `migrate`, `doctor`, `health`, `version`, `serve`, `worker`, `user`, `documents migrate-from-s3`, `backup` and `restore`, with the same exit codes 0 to 4 everywhere. `quro migrate` checks the host and the database first, takes a database lock and prepares the runtime role; `quro migrate --status [--json]` compares the database with the image without changing anything.
- An install from the published images: the [README quickstart](README.md#quickstart), [Install Quro](docs/install.md) and [the example Compose file](docs/compose.example.yaml), with the [configuration reference](docs/configuration.md), [HTTPS behind your reverse proxy](docs/reverse-proxy.md) and [uninstall](docs/uninstall.md) pages. On every change CI runs the quickstart on amd64 and a clean install on amd64 and arm64, with images built from that change.
- The [upgrade guide](docs/upgrade.md): version and digest pinning, a backup before each upgrade, `quro migrate`, readiness, rollback versus restore, what each failure looks like, a CI/CD job, the interfaces scripts can rely on, and the move from 0.7.0.
- `quro backup` and `quro restore`: one verified archive with the database dump, the documents and a manifest of checksums; optional encryption, a checked off-device copy and retention; an archive of the current data before a restore replaces it. Writes pause during a backup (they answer 503 with `Retry-After`). `docs/backup-and-restore.md` publishes measured recovery times.
- Filesystem document storage (`QRO_DOCUMENT_STORAGE`, `QRO_DOCUMENTS_DIR`) and `quro documents migrate-from-s3`, which copies documents out of S3 with checksum verification and never changes the store or the database.
- Validated configuration: every setting is checked once at startup, all problems are reported together and values are never printed. Optional features (bunq, S3, statement import) register as capabilities and have no routes or jobs when they are not configured. New settings: `POSTGRES_PORT`, `POSTGRES_SSLMODE`, `BUNQ_CLIENT_ID_FILE`, `BUNQ_CLIENT_SECRET_FILE`, `QRO_REGISTRATION_MODE`, `QRO_DOCUMENT_STORAGE`, `QRO_DOCUMENTS_DIR` and the `QRO_BACKUP_*` settings.
- Account recovery without email: `quro user invite`, `reset-password`, `revoke-sessions`, `list`, `codes` and `revoke-code`; **Forgot password?** redeems a one-time code. Settings > Security lists signed-in browsers and signs out one or all others.
- `GET /api/auth/registration`, `POST /api/auth/password-reset`, `GET` and `DELETE /api/settings/sessions`, and `documents` in `GET /api/capabilities`.
- `docs/security.md` describes the two supported deployment modes (plain HTTP on a private network, HTTPS at your reverse proxy), the threat model and the key inventory. Quro logs a warning when `SECURE_COOKIES` disagrees with the scheme browsers use.
- Documentation: install contract, PostgreSQL 18 upgrade, document storage, retiring the auto-updater, distribution and outbound connections, financial invariants, `SECURITY.md` and `ROADMAP.md`.
- Graceful shutdown: on SIGTERM the server finishes open requests and running jobs, then exits.
- CI jobs that upgrade a synthetic 0.7.0 install, rehearse the PostgreSQL 16 to 18 move, run a recovery drill, install from empty volumes, run the README quickstart and pull the published images anonymously.

### Changed

- The backend image ships PostgreSQL 18 client tools. `db:backup`, `db:restore` and `db:clear` refuse a client tool older than the server before writing anything.
- A failing migration reports the database's message and SQLSTATE instead of a generic error; nothing from that run is recorded.
- The frontend image uses nginx 1.30 (stable line). The statement parser image uses Python 3.12.14 and updated FastAPI, Starlette and Uvicorn.
- Ledger lists have an explicit order (by date, then id; budget transactions newest first); other lists are ordered by id. The web app follows every page, so totals on screen are unchanged.
- The dashboard and net-worth history fail when a read fails, instead of showing a total that leaves out an asset class.
- The runway marks its result as an estimate when it relies on a statutory rule more than 12 months past its review date.
- `BUN_ENV` no longer affects background jobs; only `NODE_ENV=test` does.
- The per-account sign-in limit (5 per 15 minutes) counts only failed attempts, so signing in on several devices no longer locks an account. The per-address limit is unchanged.
- Releases come from one commit that passed CI, run their write jobs in a protected environment with the owner's approval, check both images for anonymous pull on amd64 and arm64 before publishing, and publish release candidates as prereleases.

### Fixed

- Concurrent edits or deletes of one ledger row (a double click, two tabs, both partners) apply once instead of reversing the balance effect twice; a reviewed statement import can be committed once.
- A refused edit to a mortgage or property transaction no longer changes the balance.
- Text with a NUL character or numbers beyond a column's range answer 400 instead of 500.
- Unlinking a partner clears the former partner's joint data from the browser cache.
- `db:restore` and `db:clear` work on a database without Quro's tables, so a 0.7.0 dump restores into an empty PostgreSQL 18 database; the PostgreSQL upgrade guide restores before migrating.
- Database passwords that start with `-` or contain URL characters work.
- Concurrent `quro migrate` runs wait for each other instead of failing part way.
- Smoke runs and tests no longer call price or exchange-rate providers (`QRO_DISABLE_SCHEDULERS`).

### Security

- Session tokens are stored only as SHA-256 digests (migration `0038`; nobody is signed out). Registration and password-reset codes have 120 bits, are single use, expire and are stored as digests.
- Sign-up requires an operator-issued code by default.
- Public auth endpoints accept only JSON requests, and password reset has its own rate limit.
- The backend runs as an unprivileged user and reads its secrets from files directly.
- API errors and bank sync status messages use a fixed text for database failures.
- The Release workflow pins its actions by commit and runs its write jobs in a protected environment.
- Dependencies with advisories (`proxy-addr`, `source-map-js`, and `yahoo-finance2` with its transitive dependencies) moved to patched releases.
- An access test matrix runs every route as owner, partner, unrelated user, former partner, pending invitee and anonymous caller.

### Image digests

The digests of `ghcr.io/pieter-ohearn/quro-backend:v0.8.0` and `ghcr.io/pieter-ohearn/quro-frontend:v0.8.0` are listed in the [v0.8.0 release notes](https://github.com/Pieter-OHearn/quro/releases/tag/v0.8.0). Pin both images by tag and digest, as the [upgrade notes](docs/upgrade.md#how-upgrades-work) show.

## [v0.7.0] - 2026-10-04

- Make bunq linking optional and fail closed: Quro starts without bunq configured, the bunq start and callback endpoints return 503, and Settings explains the integration is unavailable. Partial bunq configuration now stops startup with a redacted error, and the `localhost:5173` redirect fallback is removed.
- Bind bunq OAuth callbacks to a server-recorded, single-use, 10-minute attempt for the initiating user and destination (migration `0037`), replacing the empty-key signed state. The callback also requires the state cookie from the browser that started the flow, so a shared authorize link cannot attach someone else's bunq account.
- Add cancellable timeouts to bunq and Yahoo requests, resume large bunq histories from per-page checkpoints, and bound scheduled runs with isolated database pools (migration `0036`). Job pools parse dates like the main pool, and a user price refresh records Yahoo timeouts per holding instead of failing.
- Tighten request handling: return 400 for malformed JSON on auth, settings and partner routes, key rate limits on the real peer address (honouring forwarded headers only from `TRUSTED_PROXIES`, and resolving through chained proxies via `X-Forwarded-For`), and cascade sessions when a user is deleted (migration `0035`).
- Enforce one partner link per user in the database (migration `0034`).
- Fail the aggregate CI check when any upstream job fails, align the Bun version across CI, Dockerfiles and docs, and build images in CI.
- Correct the README self-hosting instructions for v0.6.x releases.

## [v0.6.6] - 2026-10-03

- Reuse shared form controls, delete actions, and savings stat cards across frontend features.
- Use the accessible shared modal for pension imports and respect number-format preferences in archive warnings.
- Migrate frontend colors and charts to semantic design tokens, retain saved categorical colors, and guard raw palette regressions with ESLint.

## [v0.6.5] - 2026-10-03

- Share table sorting and pagination across frontend transaction histories while preserving default ordering and page resets.
- Consolidate goal forms, investment transaction metadata, and pension import status mapping.
- Split settings and pension import UI into section and step modules; derive URL and attachment state directly and reset forms by identity.

## [v0.6.4] - 2026-10-03

- Split pages, charts, and the emoji picker into deferred frontend chunks.
- Stabilize currency context helpers and memoize dashboard, mortgage, and brokerage calculations; group investment and pension history before computing totals.
- Fetch compact dashboard salary and investment-habit summaries, and poll pension notifications only while imports are queued or processing.

## [v0.6.3] - 2026-10-02

- Preserve the disconnected Bunq state by handling missing-connection responses before resolving the query.

- Centralize frontend query keys and domain dependencies, narrow mutation invalidation, and consolidate feature mutation hooks.
- Add typed API payload helpers, share error extraction and currency/transaction types, and remove redundant response normalization and invented pension import timestamps.

## [v0.6.2] - 2026-10-02

- Preserve budget currency across display preference changes: normalize manual and Bunq writes to EUR, retain native transaction provenance, and flag ambiguous legacy amounts for review.

- Resolve linked property debt directly from mortgages and share household attribution across allocations, snapshots, history, and runway.
- Return authoritative net-worth and portfolio totals with stable allocation keys and explicit currency metadata; keep allocation colours on the client.
- Standardize derived API amounts on EUR with client display conversion, and correct non-EUR budget inputs in runway calculations.
- Drive runway labels, warnings, sources, and unemployment models from jurisdiction profiles.

## [v0.6.1] - 2026-10-02

- Protect new API routes by default using a shared list of public paths, and resolve the accepted partner in the session query.
- Consolidate ownership checks, transaction reads, and archive/restore/cascade handlers while preserving existing validation and property/mortgage link rules.
- Invalidate historical net-worth snapshots for both partners on joint ledger writes and for both parents when a transaction moves.
- Separate dashboard history/activity and investment holdings/properties into focused modules.
- Upgrade Axios, brace-expansion, and pypdf to resolve dependency security advisories and restore passing CI audits.

## [v0.6.0] - 2026-09-28

- Add optional OpenTelemetry tracing for the backend: a server span per API request that continues the caller's trace, and a client span per Postgres query. It's enabled by setting `OTEL_EXPORTER_OTLP_ENDPOINT` and exports over OTLP/HTTP; query strings and parameter values aren't recorded.

## [v0.5.1] - 2026-09-10

- Add a dismissible Savings prompt for users without a Bunq connection, including per-user
  dismissal and OAuth success or error feedback that returns users to Savings.
- Resolve Hono, qs, fast-uri, and pypdf dependency security advisories.
- Decouple licensed banking entities and deposit-protection calculations from the employment
  planning jurisdiction, allowing mixed-country bank accounts without inventing coverage for
  unresolved institutions.

## [v0.5.0] - 2026-08-12

- Add a new Plan tab centred on financial resilience, with an income-stop runway that combines lean spending, accessible balances, notice pay, severance, and applicable income support into a month-by-month projection.
- Show cash-only and all-liquid runway comparisons, configurable liquidity tiers and haircuts, current and lean burn rates, and an advanced assumptions editor so users can understand and adjust the model.
- Add shared employment records across Plan and Salary, including an editable employer, employment type, start and end dates, and notice period. Tenure now updates automatically from the stored start date and feeds notice and severance calculations.
- Add effective-dated planning rules for the Netherlands, including WW and transition-compensation estimates, and for Australia, including Fair Work redundancy bands, user-confirmed JobSeeker estimates, and APRA Financial Claims Scheme coverage for eligible AUD deposits.
- Add a calculation review that separates included, excluded, and unverified support components, explains the inputs and assumptions used, and links to the relevant official sources.
- Add banking-entity review and deposit-guarantee modelling, grouping accounts by licensed entity, weighting joint ownership, applying jurisdiction-specific protection caps, and surfacing unresolved entities or modelled exposure with actionable guidance.
- Add spending-category classifications for essential, discretionary, and employment-linked costs so the runway can derive a more realistic lean monthly burn without silently inventing missing data.
- Improve historical net-worth accuracy with dated FX rates and holding-price snapshots, while clearly marking chart values that rely on estimated historical rates or prices.

## [v0.4.1] - 2026-08-05

- Add annuity and linear mortgage repayment methods, including method-aware balance projections, form controls, and clear mortgage summary labels.
- Fix mortgage time remaining calculations to use the contractual end date and support human-readable stored dates.

## [v0.4.0] - 2026-08-04

- Add dismissible fixed-rate expiry reminders to the notification centre during the six months before a mortgage's fixed term ends, with direct links to the relevant mortgage.
- Fix joint property equity throughout investment totals, trend calculations, charts, and property rows so each partner sees the correct ownership share.
- Make debt, holding, mortgage, and property balance changes atomic in the database, preventing concurrent repayments or transactions from overwriting one another.
- Improve authentication and account isolation by rate-limiting sign-in attempts per account and partner invites per user, handling concurrent sign-ups cleanly, reacting to invalidated sessions globally, and clearing cached account data when sessions change.
- Surface failed data requests on the debts, goals, investments, and mortgage pages instead of silently rendering incomplete financial data.
- Fix stale investment ticker searches, show clear conflicts when deleting budget categories that are still in use, and refresh dashboard data after Bunq settings or sync changes.
- Improve performance by bounding budget transaction history and recent dashboard activity queries, and by indexing transaction parent references used for reconciliation.
- Expand automated coverage for authentication, rate limiting, financial balance reconciliation, request validation, readiness checks, savings updates, and mortgage notifications.
- Update frontend, backend, CI, and pension parser dependencies, and add grouped Python dependency updates to Dependabot.

## [v0.3.2] - 2026-06-22

- Fix Bunq savings sync misclassifying payday interest payments as deposits by detecting the `PAYDAY` payment type.
- Fix mortgage rate type validation to read from the shared `MORTGAGE_RATE_TYPES` enum instead of a duplicated local type.
- Fix savings transaction modals closing before the save request resolved, which could drop failed saves silently.
- Fix property records allowing a `mortgageId` that no longer pointed at an existing mortgage by adding a foreign key constraint with `ON DELETE SET NULL`.
- Fix holding price sync skipping valid price updates whenever a snapshot also produced an issue for the same ticker.

## [v0.3.1] - 2026-06-15

- Fix Bunq OAuth callbacks so redirects that return without a Quro session cookie are authenticated via the HMAC-signed `state` parameter, while forged or malformed states redirect back to settings with an error.
- Fix pension pot editing in browser contexts without `crypto.randomUUID()` by using a client ID helper with Web Crypto and non-crypto fallbacks.
- Patch `form-data`, `@babel/core`, `starlette`, and `python-multipart` audit advisories through workspace and pension-parser dependency updates.

## [v0.3.0] - 2026-06-13

- Add partner linking so two accounts can share joint assets: invite/accept/decline/unlink flow, joint toggles on savings accounts, properties, and mortgages, joint badges across lists and the dashboard, and 50% weighting of joint assets in net worth, allocations, and the monthly summary.
- Add property archiving and deletion with mortgage-link reconciliation: soft-delete by default, outstanding balances reconciled across mortgage and property transactions, and archived linked mortgages treated as zero balance in current and historical dashboard equity.
- Add archive-by-default deletion for holdings, pension pots, mortgages, and debts, with a balance-aware warning dialog and restore support, preserving historical net worth instead of rewriting past wealth-chart months.
- Add editing of existing mortgage transactions from the UI, with a live balance preview for the edited repayment.
- Rebrand the design system around semantic tokens (brand, surface, border, text, status, shadow, motion) and a shared responsive DataTable, migrating buttons, badges, cards, forms, budget category progress rows, and financial tables onto the new system.
- Update Hono to 4.12.18 to resolve security advisories (CSS injection via JSX SSR, JWT NumericDate validation, and cache middleware cross-user leakage).
- Harden authentication: rate-limit the change-password endpoint, equalise sign-in password verification timing, and require owners on financial records.
- Fix a memory leak in the rate limiter by evicting expired entries.
- Map numeric database columns to numbers so financial values cross the wire as numbers rather than strings, and validate pension pot types against a shared enum.
- Improve request performance by collapsing authentication to a single JOIN query.
- Scope budget cache invalidation to the affected month, wrap savings balance updates in a transaction, and consolidate the goal normalizer so the dashboard and goals page stay consistent.
- Routine dependency updates and security patches across the workspace and the pension-parser service.

## [v0.2.1] - 2026-05-08

- Add goal editing with month-based tracking, including start month and missed month support.
- Add automatic currency rate syncing and caching backed by the database, with Yahoo Finance sync on startup, scheduled daily refreshes, stale metadata handling, and safer failure behaviour for missing non-EUR rates.
- Improve session query performance with additional indexes.
- Improve the iOS web app experience.
- Fix modal backdrop viewport coverage.
- Improve salary growth history by showing stacked net pay and deductions when payslip data is available.

## [v0.2.0] - 2026-05-06

- Show actual savings deposits in monthly summary card.
- Order the payslip table by payday.
- Add holding price sync scheduler to keep prices up to date.
- Add goal linking system with four new source types: portfolio goals auto-resolve from live brokerage value, net worth goals auto-resolve from live net worth calculation, invest habit goals auto-track monthly completion by counting distinct months with buy transactions, and savings account goals now link to real accounts.

## [v0.1.3] - 2026-05-04

- Switch investment market data lookup and price syncing to Yahoo Finance, removing the Marketstack API key and deployment wiring.
- Add manual holding price overrides and an option to exclude holdings from automatic price sync.
- Show manual price and sync status in the brokerage holdings table.
- Fix salary growth history charts so mixed-currency entries in the same year render as one combined annual bar.

## [v0.1.2] - 2026-05-04

- Support joint account budget imports from Bunq.
- Preserve transaction history when removing savings accounts, with optional full delete.
- Refactor Debts page into modular components.
- Improve mortgage amortization calculations with dynamic projection periods and per-month precision.
- Add mortgage metrics unit tests.
- Enhance validation utilities and password constraints in shared types.
- Improve goals feature with dedicated year utilities.
- Update backend schema for Bunq account metadata tagging.

## [v0.1.1] - 2026-05-03

- Allow savings accounts to be removed without deleting their transaction history, while keeping an explicit full-delete option for removing both the account and its transactions.

## [v0.1.0] - 2026-05-03

- Introduce the Bunq connection and auto-import flow, including OAuth account linking, connected-account settings, savings account/transaction imports, and budget transaction imports from Bunq payments.

## [v0.0.2] - 2026-03-18

- Fix the backend Docker/release database configuration so Postgres resolves via `db:5432` instead of falling back to `127.0.0.1`, including support for Docker secret-based credentials and release-time migrations.

## [v0.0.1] - 2026-03-15

- First MVP test release: stood up the initial backend/frontend services, Docker orchestration, and CI skeleton to prove the deployment flow end to end.
