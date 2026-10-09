# Roadmap

Quro is a self-hosted personal finance app: budgeting, savings, investments, pensions and long-term planning in one dashboard. This page says where the project is heading. It is a statement of intent, not a promise or a schedule, and it changes as the project learns.

Quro has a single maintainer. Things are listed in the order they are likely to happen, but dates are deliberately left out.

## Now: towards 1.0

Version 1.0 is the release where a hobbyist or developer can install Quro, run it safely at home and keep their data. It contains:

- **A tested install.** Install with Docker Compose from the README, on amd64 or arm64, using published images. The quickstart is run in CI, so it keeps working.
- **Backup and restore.** One command to back up, one to restore, covering the database and uploaded documents, with a recovery drill. Upgrades between releases come with upgrade notes.
- **Two supported ways to run it.** Plain HTTP on a private network, or HTTPS behind your own reverse proxy.
- **Closed registration.** Registration closes once the first owner exists. Further accounts are created by the operator, and recovery does not need an email server.
- **A new design.** A denser, calmer look for desktop and phone, in light and dark mode, with accessible tables, charts and forms.
- **Data in and out.** CSV import with a review step before anything is committed, and a full export of your data.
- **Trustworthy numbers.** Money, currency conversion and planning calculations are covered by tests, and integration secrets are encrypted at rest.
- **Optional features stay optional.** Bank linking, statement OCR, S3 storage and tracing can be switched on or off without affecting the core app.

## After 1.0

These are wanted but not part of 1.0:

- Sign-in with an external identity provider (OIDC).
- Household roles beyond the current partner model.
- Notifications.

## Being explored

These are ideas, not commitments, and may change or be dropped:

- AI-assisted explanations of your own numbers, running privately.
- A command-line interface.
- An opt-in way to let AI tools read your data safely (MCP).

## How to help

Bug reports and ideas are welcome as [issues](https://github.com/Pieter-OHearn/quro/issues) and [discussions](https://github.com/Pieter-OHearn/quro/discussions). See [CONTRIBUTING](docs/CONTRIBUTING.md) before opening a pull request.
