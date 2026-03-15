# Contributing

Thanks for helping improve Quro! This document focuses on the workflow for proposing changes and shipping releases through the protected `main` branch.

## Pull Request Workflow

1. **Branching** – create a feature branch from `main`. Direct pushes to `main` are blocked via branch protection.
2. **Code + tests** – implement your changes and run `bun run ci:check` locally when possible.
3. **Update the release notes** – edit `CHANGELOG.md` inside the relevant section, or add a new section if you are preparing a release.
4. **Bump the version** – use the helper script to increment the semantic version stored in `VERSION`:

   ```bash
   bun scripts/bump-version.ts minor   # or major / patch / prerelease
   ```

   The script updates `VERSION` and prints the next value. Every PR merged into `main` must include a version bump that is greater than the previous release.

5. **Open the PR** – target `main`, ensure all GitHub Actions checks (format, lint, tests, version guard, etc.) pass, and request a review.
6. **Merge** – once approved, merge via the PR UI. The release workflow automatically tags the commit, publishes multi-architecture Docker images to GitHub Container Registry (GHCR), and attaches a deployment manifest to the GitHub Release.

## Version Guard

CI runs `scripts/verify-version-bump.ts` on every push/PR. It ensures:

- `VERSION` follows `vX.Y.Z` SemVer format.
- The proposed version differs from the base branch and is greater than the most recent tag.

If the job fails, bump the version (see above) and re-run CI.

## Release Artifacts

The `release` GitHub workflow (triggered by merges to `main`) performs the following:

- Reads the `VERSION` file and creates/pushes a matching git tag.
- Builds and pushes multi-arch Docker images to `ghcr.io/<owner>/quro-backend` and `.../quro-frontend`, tagging each with both the SemVer value and `latest`.
- Extracts the CHANGELOG section for the version and uses it as the GitHub Release notes.
- Generates a `docker-compose.release.yml` file pinned to the freshly published images and attaches it to the Release so self-hosters can deploy without cloning the repository.

## Branch Protection

Enable the following protections for `main` inside the GitHub repository settings:

- Require pull request reviews before merging.
- Require status checks to pass before merging (select all jobs from `.github/workflows/ci.yml`).
- Require branches to be up to date before merging.
- Disallow force pushes and direct pushes.

These settings keep `main` deployable and ensure every change follows the release process described above.
