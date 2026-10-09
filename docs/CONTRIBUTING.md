# Contributing

Thanks for helping improve Quro! This document focuses on the workflow for proposing changes and shipping releases through the protected `main` branch.

## Pull Request Workflow

1. **Branching** – create a feature branch from `main`. Direct pushes to `main` are blocked via branch protection.
2. **Code + tests** – implement your changes and run `bun run ci:check` locally when possible. Check your setup with `bun run dev:doctor`, and run DB-backed checks against a throwaway database as described in [DB-backed tests](development.md#db-backed-tests).
3. **Update the release notes** – edit `CHANGELOG.md` inside the relevant section, or add a new section if you are preparing a release. Do not change `VERSION` in a feature pull request (see [versioning](#versioning)).
4. **Open the PR** – target `main`, ensure all GitHub Actions checks (format, lint, tests, etc.) pass, and request a review.
5. **Merge** – once approved, merge via the PR UI. Merging does not tag or publish anything; releases are cut separately (see [release artifacts](#release-artifacts)).

## Versioning

- `VERSION` holds the release version (for example `v0.7.0`) and is the only version in the repository. The workspace `package.json` files have no `version` field and are private; Quro ships as container images, not npm packages (see [packages and versions](development.md#packages-and-versions)).
- Feature pull requests do not change `VERSION`. The release pull request sets it, together with the matching `CHANGELOG.md` section.
- No CI job requires a version bump.

## Release Artifacts

The `Release` GitHub workflow runs only when a maintainer starts it manually (`workflow_dispatch`) with a branch or tag to release; merges to `main` do not trigger it. It performs the following:

- Reads the `VERSION` file at that ref and creates and pushes a matching git tag. It stops if the tag already exists.
- Builds and pushes multi-arch Docker images to `ghcr.io/<owner>/quro-backend`, `.../quro-frontend` and `.../quro-auto-updater`, tagging each with both the version and `latest`.
- Extracts the CHANGELOG section for the version and uses it as the GitHub Release notes.
- Generates a `docker-compose.release.yml` file pinned to the freshly published images and an auto-update bundle, and attaches both to the Release.

## Branch Protection

Enable the following protections for `main` inside the GitHub repository settings:

- Require pull request reviews before merging.
- Require status checks to pass before merging. At minimum require the aggregate `CI` job; it runs with `if: always()` and fails unless every job it needs finished with `success` (a failed, cancelled or skipped upstream job fails it). Keep its `needs` list in sync with the other jobs in `.github/workflows/ci.yml`; `scripts/lib/ci-gate.test.ts` enforces this.
- Apply the rules to administrators too ("Do not allow bypassing the above settings" / `enforce_admins`), so a failing gate cannot be merged around.
- Require branches to be up to date before merging.
- Disallow force pushes and direct pushes.

These settings keep `main` deployable and ensure every change follows the release process described above.
