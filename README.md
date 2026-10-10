# Quro

[![Latest Release](https://img.shields.io/github/v/release/Pieter-OHearn/quro)](https://github.com/Pieter-OHearn/quro/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Pieter-OHearn/quro/ci.yml?branch=main&label=CI)](https://github.com/Pieter-OHearn/quro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/Pieter-OHearn/quro)](LICENSE)
[![GHCR](https://img.shields.io/badge/ghcr.io-quro-blue?logo=docker)](https://github.com/Pieter-OHearn/quro/pkgs/container/quro-frontend)

Quro is a self-hosted personal finance app for one household. It brings budgets, savings accounts, investments, pensions, a mortgage, debts, salary and goals into one dashboard, converts between currencies, and keeps payslips and pension statements next to the numbers they belong to.

It runs with Docker on a computer you own, such as a home server, a NAS or an arm64 single-board computer. Your records stay in a PostgreSQL database and a documents directory on that machine. There is no Quro account, no cloud service and no telemetry.

Quro is for people who are comfortable running a few containers at home. It is pre-1.0 and has a single maintainer; the [roadmap](ROADMAP.md) says what 1.0 will contain.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="The Quro dashboard of a new demo household: net worth, savings, investments, pension, salary and liability cards, a net worth chart and the asset allocation" width="900" />
</p>
<p align="center"><sub>The dashboard of a new household, created by the built-in demo seed. The name and email address are synthetic.</sub></p>

## Quickstart

This installs Quro on one host from the published images, with the example Compose file. CI runs these commands on every change, with images built from that change standing in for the release.

Quro 0.8.0 is the first release that installs this way. Releases up to 0.7.0 have no supported install path; if you run one, see [Upgrade](#upgrade).

| You need                   | Details                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A host                     | Linux on amd64 or arm64 with Docker Engine and the Compose v2 plugin (`docker compose version`). Docker Desktop on macOS works for a trial                          |
| Disk and memory            | About 2 GB of disk for the images and 512 MB of free memory, plus room for your data and backups                                                                    |
| Network                    | Access to `ghcr.io` and Docker Hub to pull images, without a registry account, and to Yahoo Finance for exchange rates (see [privacy](#privacy-and-network-access)) |
| Permission to run `docker` | Membership of the `docker` group, or prefix the `docker` commands with `sudo`                                                                                       |
| Not needed                 | A GPU, an email server, an object store, a bank account, a domain name                                                                                              |

<!-- quickstart:begin -->

1. Create a directory and download the example Compose file of the release:

   ```bash
   mkdir -p quro/config quro/data/documents quro/backups && cd quro
   curl -fsSL -o compose.yaml https://raw.githubusercontent.com/Pieter-OHearn/quro/v0.8.0/docs/compose.example.yaml
   ```

   Read `compose.yaml` before you start it. It is a plain file with four services and no template step: `db` (PostgreSQL 18), `migrate` (applies the schema, then exits), `backend` and `frontend`.

2. On Linux, give the three directories to UID 1000, the user the backend runs as. Skip this on Docker Desktop, or when `id -u` already prints `1000`:

   <!-- quickstart:linux-only -->

   ```bash
   sudo chown 1000:1000 config data/documents backups
   ```

3. Write the settings file and generate the database passwords:

   ```bash
   docker run --rm -v "$PWD/config:/config" ghcr.io/pieter-ohearn/quro-backend:v0.8.0 init
   ```

   This creates `config/quro.env` and two password files in `config/secrets/` (24 random bytes each, readable by their owner only). The passwords are never printed. The defaults match the example Compose file, so you can review the settings later; the next step runs `quro migrate` for you.

4. Start Quro:

   ```bash
   docker compose up -d
   ```

   The command returns once the database is up, the schema is in place and the backend reports ready.

5. Create a one-time setup code for the first account:

   ```bash
   docker compose exec backend quro user invite
   ```

<!-- quickstart:end -->

Open `http://localhost:3000`, or `http://<host>:3000` from another device on your network, choose **Get started**, and enter the code with your name, email and password. That account is the household's owner.

New accounts after the first need a code from the same command; registration is invite-only by default. A forgotten password is reset with `docker compose exec backend quro user reset-password <email>`, which prints a code to enter under **Forgot password?**. Quro sends no email.

### Check that it is healthy

```bash
docker compose ps
```

`db` and `backend` show `(healthy)` and `frontend` shows `Up`. `migrate` is not listed because it has finished; `docker compose ps -a` shows it as `Exited (0)`. The readiness endpoint answers `200` with `"status":"ready"`:

```bash
curl -fsS http://localhost:3000/api/readiness
```

`docker compose run --rm migrate doctor` checks the settings, both database roles, the schema and the documents directory, and ends with `All checks passed.` If something is not healthy, `docker compose logs migrate backend` usually says why; [Install Quro](docs/install.md) covers the details.

### What runs where

| What               | Where                                                               |
| ------------------ | ------------------------------------------------------------------- |
| Web app            | Port `3000` on every interface of the host. The only published port |
| Settings           | `config/quro.env`. Edit it, then run `docker compose up -d`         |
| Database passwords | `config/secrets/`, generated by `quro init`                         |
| Database           | The Docker volume `quro_postgres`                                   |
| Uploaded documents | `data/documents/`                                                   |
| Backups            | `backups/`, written by `docker compose run --rm migrate backup`     |

Every step can run again safely, except that the download in step 1 replaces `compose.yaml`, so keep a copy once you have edited it. `quro init` only creates missing files and never changes an existing one; `docker compose up -d` leaves running services alone and recreates only what changed; `migrate` runs on every start and changes nothing when the schema is current. `docker compose down` followed by `up -d` keeps all data. Keep a copy of `config/` somewhere safe: backups do not include it.

### Verify what you install

`compose.yaml` comes from the release tag over HTTPS, and you can read all of it. The images pull without an account; [distribution](docs/distribution.md) explains how anyone can check that. To be sure you run exactly the published images, pin them by digest so that Docker refuses anything else; [Install Quro](docs/install.md#verify-the-images) shows how.

### Existing PostgreSQL or S3-compatible store

The quickstart starts its own PostgreSQL and keeps documents in a directory. To use a PostgreSQL server you already run (16, 17 or 18), or to keep documents in an S3-compatible store, follow [Existing PostgreSQL server](docs/install.md#existing-postgresql-server) and [Existing S3-compatible store](docs/install.md#existing-s3-compatible-store).

## Configuration

Settings live in `config/quro.env`, which `quro init` writes with a comment for each one. Secrets are files in `config/secrets/`, never values in the settings file. Every setting is checked when a container starts: a wrong value stops it with exit code 2 and a list of the problems, without printing any value. The settings most installs touch:

| Setting                 | Default         | Change it when                                                                              |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `SECURE_COOKIES`        | `false`         | Browsers reach Quro over HTTPS: set `true` ([reverse proxy](docs/reverse-proxy.md))         |
| `TRUSTED_PROXIES`       | `172.16.0.0/12` | Docker uses other address ranges, or your reverse proxy runs on another machine             |
| `QRO_REGISTRATION_MODE` | `invite`        | You want `closed` (no new accounts) or `open` (anyone who can reach Quro may sign up)       |
| `QRO_DOCUMENT_STORAGE`  | `filesystem`    | You keep documents in an S3-compatible store: `s3` with the `S3_` settings                  |
| Published port          | `3000`          | Edit `ports` of the `frontend` service in `compose.yaml`, for example `'127.0.0.1:3000:80'` |

The [configuration reference](docs/configuration.md) lists every service, port, directory and setting, with defaults.

## Upgrade

Quro never updates itself. To move to a new release: read its upgrade notes, back up with the version you run, change the image tags in `compose.yaml`, then run `docker compose pull` and `docker compose up -d`; `migrate` applies the new schema before the backend starts. Installs of 0.7.0 and earlier, including the release Compose file and checkouts of this repository, move over once with the 0.8.0 upgrade notes.

## Backup and restore

```bash
docker compose run --rm migrate backup
```

This writes one checked archive with the database and the documents to `backups/`, pausing changes for about a second per 100 MB of data. Copy the archives to another device, keep `config/` separately, and schedule the command daily. [Backup and restore](docs/backup-and-restore.md) covers encryption, off-device copies, retention, restoring on the same or a new machine, and rehearsing a restore.

## Security model

Quro supports two deployment modes. The app does not enforce TLS in either:

- **A: plain HTTP on a private network.** The quickstart's default. Use it only on a network where you trust every device, and never forward the port to the internet.
- **B: HTTPS behind your reverse proxy.** A proxy you run (Caddy, Traefik, nginx) terminates TLS in front of Quro's bundled nginx. Set `SECURE_COOKIES=true` and check `TRUSTED_PROXIES`. [HTTPS with a reverse proxy](docs/reverse-proxy.md) has a tested example.

A new instance has no accounts and no default password: the first account needs a setup code from the operator, and later accounts need an invite code. Sessions and codes are stored only as digests. The operator, meaning whoever runs the containers, can read every record; Quro protects a household from other users and from the network, not from its operator. The [security model](docs/security.md) is the full threat model. Report a vulnerability privately as described in [SECURITY.md](SECURITY.md).

## Privacy and network access

Quro keeps your data on your host and sends nothing to the project. These are all of its outbound connections:

| From         | To                                    | When                                                                                                                     | What the other side learns                                |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Docker       | `ghcr.io`, Docker Hub                 | Pulling images at install and upgrade                                                                                    | Your IP address and the images you pull                   |
| The backend  | Yahoo Finance                         | On by default: exchange rates and prices of the tickers you hold, at start and daily, and a lookup when you add a ticker | Your IP address, the tickers you hold and your currencies |
| Your browser | `cdn.jsdelivr.net`                    | Images for the emoji picker, only while it is open                                                                       | Your IP address                                           |
| The backend  | bunq                                  | Only when bank linking is configured: hourly while an account is linked                                                  | What bank linking needs                                   |
| The backend  | Your S3 endpoint, your OTLP collector | Only when you configure them                                                                                             | Documents or traces, sent to a service you run            |

Quro needs Yahoo Finance once: the web app shows balances only after it has an exchange rate for every supported currency, and a new install fetches them when the backend starts. Until then, the app shows **Converted balances are paused** after sign-in, and the backend tries again every minute. Once the rates are stored, blocking Yahoo Finance at a firewall is safe: rates and prices stop updating, and stored rates age as described in [financial invariants](docs/financial-invariants.md). There is no switch to turn off only this provider.

With no outbound access at all, Quro still starts, passes its health checks, signs users in and stores records and documents; only the web app waits for exchange rates. The content security policy allows no third-party host besides `cdn.jsdelivr.net`. [Distribution](docs/distribution.md#service-feature-hardware-and-egress-matrix) lists every connection per feature, with the hardware each needs.

## Optional features

Each is off until you configure it, and the core works without it.

| Feature                      | What it needs                                                                                   | Set up with                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| bunq bank linking            | A bunq account and an OAuth client; `FRONTEND_ORIGIN` and the `BUNQ_` settings                  | [Configuration: bunq](docs/configuration.md#bunq)                            |
| S3-compatible document store | A store you run or rent, a bucket and an access key                                             | [Existing S3-compatible store](docs/install.md#existing-s3-compatible-store) |
| Statement import (OCR)       | An NVIDIA GPU and images built from a checkout; reads pension statement PDFs with a local model | [Pension import](docs/development.md#optional-pension-import-development)    |
| Tracing                      | An OTLP/HTTP collector you run                                                                  | [Configuration: tracing](docs/configuration.md#tracing)                      |

## Limitations

Quro is pre-1.0. What it does not do yet, or does only partly:

- **Single host, single process.** One backend per database is tested. Rate limits are kept in memory per process.
- **No built-in HTTPS.** Mode A is plain HTTP; HTTPS needs a reverse proxy you run.
- **No email and no second factor.** Invites and password resets are codes the operator issues from the command line. Two-factor sign-in, sign-in with an external identity provider and notifications are not available.
- **One household.** Accounts share data only through the partner model: two people, each with private records and shared joint ones.
- **Prices and exchange rates come from Yahoo Finance only,** through an unofficial interface that can change without notice. There is no other provider and no switch to turn off only this one, and a new install cannot show balances until it has fetched the rates once.
- **Bank linking supports bunq only.** Other banks need manual entry.
- **No data export or CSV import yet.** Both are planned for 1.0. Until then, `quro backup` is the way to take your data with you.
- **Statement import is not part of the example install.** It needs a GPU and images built from a checkout.
- **PostgreSQL 16:** Quro runs on it, but restoring a backup needs PostgreSQL 17 or 18.
- **Tested in CI and containers,** on amd64 and arm64 runners and Docker Desktop, not on a Raspberry Pi or a NAS. Measured times are in [backup and restore](docs/backup-and-restore.md#recovery-objectives).
- **Breaking changes between minor versions** are possible before 1.0. Each release's upgrade notes say what to change.

## Documentation

| For           | Read                                                                                                                                                                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Running Quro  | [Install](docs/install.md), [configuration reference](docs/configuration.md), [HTTPS with a reverse proxy](docs/reverse-proxy.md), [backup and restore](docs/backup-and-restore.md), [uninstall](docs/uninstall.md), [document storage](docs/document-storage.md), [security model](docs/security.md) |
| Automating it | [Install contract](docs/install-contract.md) (commands, exit codes, readiness, file ownership), [distribution](docs/distribution.md) (images, anonymous access, egress)                                                                                                                               |
| Changing Quro | [Development](docs/development.md), [contributing](docs/CONTRIBUTING.md), [architecture](docs/architecture.md), [adding a feature](docs/adding-a-feature.md)                                                                                                                                          |

## Contributing

Contributions are welcome. [Development](docs/development.md) sets up a checkout, either with Bun on the host or with the Docker development stack, and lists the checks to run. [Contributing](docs/CONTRIBUTING.md) describes pull requests and releases. Install the pre-commit hook before your first commit:

```bash
brew install gitleaks
bun run hooks:install
```

Use synthetic data only in issues, tests and screenshots. The demo seed (`bun run --filter '@quro/backend' db:seed-demo`) creates a complete household to work with.

## Support

- **Questions and ideas:** [GitHub Discussions](https://github.com/Pieter-OHearn/quro/discussions).
- **Bugs:** [open an issue](https://github.com/Pieter-OHearn/quro/issues/new/choose). Include your Quro version (`docker compose exec backend quro version`) and how you run it.
- **Security problems:** report them privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

Quro has a single maintainer, and replies are best effort. The most useful ways to help are clear bug reports, testing a release on your own setup, and improving the documentation.

## Licence

[MIT](LICENSE)
