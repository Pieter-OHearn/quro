# Monitor an install

This guide is for operators. It describes what `quro doctor` reports about a running install, how Quro writes its logs, and how a backup or CI job you run yourself shows up. For readiness and exit codes see [Interfaces for automation](upgrade.md#interfaces-for-automation).

## Health, readiness and doctor

| Surface                                  | Answers                                                                                                | Who can call it                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `GET /api/health`                        | The process is running. Reports no household data.                                                     | Anyone who can reach the server                          |
| `GET /api/readiness`                     | Whether to route traffic: the database answers, the schema matches the image and documents are usable. | Anyone who can reach the server                          |
| `docker compose run --rm migrate doctor` | Everything below, with remediation, as text or `--json`. Changes nothing.                              | The operator, from a shell with the settings and secrets |

Quro has no operator role in the app: instance operations are `quro` commands, so the detailed status is only available to whoever can run one. Neither endpoint lists jobs, versions, disk space or backups.

`quro doctor` checks settings, both database roles, the schema, the backup tool, the document store and the bank-link secrets (see [install](install.md#commands)), and also:

| Check id                         | What it reads                                                                                   | Not healthy when                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `jobs.<name>`                    | The last success and last failed cycle the server recorded for each background job              | No success within two intervals (stale), or the last cycle failed after the last success  |
| `freshness.currency_rates`       | When currency rates were last updated                                                           | No rates (unknown), or none for 3 days                                                    |
| `freshness.net_worth`            | The date of the newest net worth snapshot                                                       | Older than 3 days                                                                         |
| `freshness.bunq`                 | The newest bank sync, when a bank link exists                                                   | Never synced (unknown), or none for 2 days                                                |
| `disk.documents`, `disk.backups` | Free space on the document directory and the backup directory                                   | Under 10% free (warning), under 3% free (failure)                                         |
| `backup.age`                     | The time in the name of the newest archive in `QRO_BACKUP_DIR`                                  | None found or directory unreadable (unknown), or older than 2 days                        |
| `documents.references`           | Whether each document a row refers to exists in the filesystem store (S3 stores are not listed) | Any is missing. A lost bind mount is recreated empty by Docker, so readiness still passes |

Application and schema versions are in the first line of the text output and in `build` of the JSON report.

### What the statuses mean

- `ok`: the evidence is recent enough.
- `warn`: something is late or at risk, or an optional integration is failing. Exit code stays 0.
- `fail`: a core job has stopped or keeps failing, a document is missing, or the disk is nearly full. Exit code 1.
- `unknown`: nothing proves it either way: a job has no recorded run, or no backup could be found. Unknown is never reported as healthy, and it does not change the exit code. Read it as "check this yourself".
- `skip`: the check could not run, for example because the schema is not migrated.

A core job (`session-cleanup`, `holding-price-sync`, `currency-rate-sync`, `net-worth-snapshot`) that stops is a failure (`net-worth-snapshot` also applies property valuations whose date has come, so while it is stopped a valuation dated in the future does not take effect); the optional `bunq-sync` job is a warning, so an outage at the bank never marks the core as down. Readiness is unaffected by any of this.

## Backups and CI jobs you run

Quro cannot see a scheduler outside the container, so it reads the evidence the job leaves.

- **Backups.** `quro backup` names each archive with its UTC time. `backup.age` takes the newest one in `QRO_BACKUP_DIR` (mount that directory into the container that runs `doctor`; the example `migrate` service does). It does not open the archive: run `quro backup verify` for that. The default staleness limit is two days, which suits a daily schedule. Weekly schedules should treat `warn` accordingly, or monitor the archive age themselves.
- **No evidence is unknown.** An empty or unreadable backup directory reports `unknown`, never `ok`.
- **CI and deploy jobs** are not visible to the instance. Report them in your own tooling; Quro does not store their status.

## Logs

The server and the import worker write one JSON object per line: `info` to standard output, `warn` and `error` to standard error. Every line has `time`, `level` and `event` (a stable name such as `request.failed` or `job.cycle_failed`). Lines written while serving a request carry `requestId`, the same value the response returns in the `X-Request-Id` header. A reverse proxy may send its own `X-Request-Id` (8 to 64 letters, digits, `.`, `_` or `-`); anything else is replaced. OpenTelemetry spans carry it as `quro.request_id`.

Logs and spans do not contain request or response bodies, statements or their parameters, tokens, keys, email addresses, or the message or stack of an error. An error is recorded as its class (`errorName`) and, when it has one, its database or system code (`errorCode`) and HTTP status (`errorStatus`). Fields whose names look like credentials or personal data are replaced with `[redacted]`. Open a failing request by its `requestId` to find the route and event.

`quro` commands that print for a person (`migrate`, `backup`, `restore`, `doctor`) keep their plain text output.

## Retries

Nothing retries without a limit:

- A background job that fails waits one minute, then two, doubling up to its own interval, and resets after a success. Each failure is logged as `job.cycle_failed` with `consecutiveFailures` and `retryInSeconds`.
- Provider calls have their own time limits and bounded retries ([provider timeouts](provider-timeouts.md)).
- A statement import that finds the parser busy stays queued and is retried on the worker's next poll.
