# Contributing

Thanks for helping improve Quro! This document focuses on the workflow for proposing changes and shipping releases through the protected `main` branch.

## Pull Request Workflow

1. **Branching** – create a feature branch from `main`. Direct pushes to `main` are blocked via branch protection.
2. **Code + tests** – implement your changes and run `bun run ci:check` locally when possible.
3. **Update the release notes** – edit `CHANGELOG.md` inside the relevant section, or add a new section if you are preparing a release.
4. **Open the PR** – target `main`, ensure all GitHub Actions checks (format, lint, tests, etc.) pass, and request a review.
5. **Merge** – once approved, merge via the PR UI. The release workflow automatically tags the commit, publishes multi-architecture Docker images to GitHub Container Registry (GHCR), and attaches a deployment manifest to the GitHub Release.

## Release Artifacts

The `release` GitHub workflow (triggered by merges to `main`) performs the following:

- Reads the `VERSION` file and creates/pushes a matching git tag.
- Builds and pushes multi-arch Docker images to `ghcr.io/<owner>/quro-backend` and `.../quro-frontend`, tagging each with both the SemVer value and `latest`.
- Extracts the CHANGELOG section for the version and uses it as the GitHub Release notes.
- Generates a `docker-compose.release.yml` file pinned to the freshly published images and attaches it to the Release so self-hosters can deploy without cloning the repository.

## Branch Protection

Enable the following protections for `main` inside the GitHub repository settings:

- Require pull request reviews before merging.
- Require status checks to pass before merging. At minimum require the aggregate `CI` job; it runs with `if: always()` and fails unless every job it needs finished with `success` (a failed, cancelled or skipped upstream job fails it). Keep its `needs` list in sync with the other jobs in `.github/workflows/ci.yml`; `scripts/lib/ci-gate.test.ts` enforces this.
- Apply the rules to administrators too ("Do not allow bypassing the above settings" / `enforce_admins`), so a failing gate cannot be merged around.
- Require branches to be up to date before merging.
- Disallow force pushes and direct pushes.

These settings keep `main` deployable and ensure every change follows the release process described above.
