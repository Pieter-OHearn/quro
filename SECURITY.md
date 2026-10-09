# Security policy

## Supported versions

Security fixes are made for the latest published release only. Quro is pre-1.0, so please upgrade to the newest release before reporting, and check that the problem still occurs there.

## Reporting a vulnerability

Please report security problems privately, not in public issues, discussions or pull requests.

Use GitHub's private vulnerability reporting: open the [Security tab](https://github.com/Pieter-OHearn/quro/security) and choose **Report a vulnerability**, or go straight to the [report form](https://github.com/Pieter-OHearn/quro/security/advisories/new).

A useful report includes:

- the Quro version and how you run it (for example plain HTTP on a private network, or behind your own HTTPS reverse proxy);
- what you did, what you expected and what happened;
- the impact as you understand it, and a minimal way to reproduce it.

Please use synthetic data only. Do not include real financial data, passwords, tokens or other secrets in a report.

## What to expect

Quro has a single maintainer, so responses are best effort:

- You should get an acknowledgement within 7 days.
- The maintainer will tell you whether the report is accepted, and will keep you updated while a fix is prepared. Time to fix depends on severity and complexity.
- Fixes ship in a new release. Once users have had a reasonable chance to upgrade, the release notes describe the change, and you are credited if you wish.

Please give the maintainer a reasonable time to release a fix before you disclose the problem publicly.

## Scope and threat model

The threat model, and the protections Quro relies on, are described in [docs/security.md](docs/security.md). In short, Quro is built to run on a private network or behind the operator's own reverse proxy. Weaknesses in how you expose, configure or secure the host, the network or the reverse proxy are outside Quro's scope, but reports about how the documentation could prevent such mistakes are welcome as ordinary issues.
