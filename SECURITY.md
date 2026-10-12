# Security policy

## Supported versions

| Version                   | Security fixes |
| ------------------------- | -------------- |
| Latest published release  | Yes            |
| Any earlier release       | No: upgrade    |
| Unreleased code on `main` | Best effort    |

Fixes ship in a new release with upgrade notes: a patch release (for example 0.8.1) unless the next planned release is close. Quro is pre-1.0, so please upgrade to the newest release before reporting, and check that the problem still occurs there. The images of each release are listed by digest in its release notes; `latest` follows the newest release.

## Reporting a vulnerability

Please report security problems privately, not in public issues, discussions or pull requests.

Use GitHub's private vulnerability reporting: open the [Security tab](https://github.com/Pieter-OHearn/quro/security) and choose **Report a vulnerability**, or go straight to the [report form](https://github.com/Pieter-OHearn/quro/security/advisories/new).

A useful report includes:

- the Quro version and how you run it (for example plain HTTP on a private network, or behind your own HTTPS reverse proxy);
- what you did, what you expected and what happened;
- the impact as you understand it, and a minimal way to reproduce it.

Please use synthetic data only. Do not include real financial data, passwords, tokens or other secrets in a report.

## What to expect

Quro has a single maintainer, so responses are best effort and no response time is guaranteed. Reports are read, and genuine problems are fixed in a new release as soon as the maintainer is able to. The release notes describe the change once users have had a reasonable chance to upgrade.

Please give the maintainer a reasonable time to release a fix before you disclose the problem publicly.

## How findings are handled

The same process covers private reports and findings from Quro's own scanners.

**Scanning.** Every pull request and every push to `main` runs, as required checks:

| Gap                                                            | Tool                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Known vulnerabilities in JavaScript and Python dependencies    | `bun audit`, `pip-audit`; Dependabot proposes updates weekly                                                          |
| Code patterns (SAST) in TypeScript, Python and the workflows   | GitHub CodeQL (repository code scanning, also weekly)                                                                 |
| Vulnerabilities and secrets in the backend and frontend images | Trivy, on the images built from the change                                                                            |
| Misconfigured Dockerfiles                                      | Trivy                                                                                                                 |
| Secrets in commits                                             | gitleaks on the change's commits, the same scanner as the pre-commit hook; GitHub secret scanning and push protection |
| Licences of shipped dependencies                               | `scripts/lib/licence-inventory.ts`                                                                                    |

A weekly [Security Scan](.github/workflows/security-scan.yml) workflow scans the published `latest` images against current vulnerability data, the optional statement-import parser image, every commit of every branch and tag for secrets, and the expiry of accepted findings. [Development](docs/development.md#security-scans) shows how to run the scans locally.

**Severity and targets.** The maintainer owns triage. Severity is the scanner's or the advisory's, adjusted for Quro's [threat model](docs/security.md): a flaw reachable only from the host, or in a component Quro does not use, is lower; one reachable by any signed-in user or from the network, higher.

| Severity    | Gate                       | Target                                                                           |
| ----------- | -------------------------- | -------------------------------------------------------------------------------- |
| Critical    | Fails CI                   | Fixed or mitigated in a release within 7 days of a fix being available           |
| High        | Listed in the scan summary | Fixed in the next release, at the latest within 30 days of a fix being available |
| Medium, low | Not listed                 | Picked up by the regular base image and dependency updates                       |

Any secret found in a commit or an image fails CI; it is revoked first, whatever the severity. Targets are goals for a single maintainer, not guarantees.

**Exceptions.** A finding that blocks CI and cannot be fixed yet (no fixed package, not reachable) is accepted only by an entry in [`security-exceptions.yaml`](security-exceptions.yaml) with a statement of why, an owner and an expiry date at most 90 days ahead. On that date the finding blocks again, and the weekly scan fails until the entry is renewed with a new statement or removed. Prefer a fix, an upgraded base image or a removed package.

## Scope and threat model

The threat model, and the protections Quro relies on, are described in [docs/security.md](docs/security.md). In short, Quro is built to run on a private network or behind the operator's own reverse proxy. Weaknesses in how you expose, configure or secure the host, the network or the reverse proxy are outside Quro's scope, but reports about how the documentation could prevent such mistakes are welcome as ordinary issues.
