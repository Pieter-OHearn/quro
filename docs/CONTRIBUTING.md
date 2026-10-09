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

The `Release` GitHub workflow runs only when a maintainer starts it manually (`workflow_dispatch`) with a branch, tag or commit SHA to release; merges to `main` do not trigger it. It resolves that ref to one commit SHA and builds, tags and publishes exactly that commit, in three jobs:

1. **Verify** (token scopes `contents: read`, `checks: read`, `actions: read`) stops the release unless all of these hold:
   - `VERSION` at the commit reads `vX.Y.Z` or `vX.Y.Z-rc.N`. It is validated as data and never interpolated into a shell command.
   - The aggregate `CI` check succeeded on that exact commit in a `push` or manually started run of `.github/workflows/ci.yml`. A pull request run tests a merge with the base branch, so it does not count. The most recent such run decides, and a run that is still queued or in progress stops the release.
   - No release for the version is published, and the version tag either does not exist or already points at the commit.
   - `CHANGELOG.md` has a section for the version.
2. **Build** (`contents: read`, `packages: write`) builds the multi-arch images and pushes them to `ghcr.io/<owner>/quro-backend`, `.../quro-frontend` and `.../quro-auto-updater` under a candidate tag, `sha-<commit>`. No git tag, version tag or `latest` tag exists yet.
3. **Publish** (`contents: write`, `packages: write`) creates the git tag at the commit and adds the version tag to the candidate image digests without rebuilding them. It then creates a draft GitHub Release with the CHANGELOG section, a `docker-compose.release.yml` pinned to the version and an auto-update bundle, moves `latest` to the same digests when the version takes it (see below), and publishes the release as its last step.

`latest`, both the image tag and the repository's latest GitHub Release, moves only for a stable version newer than every published stable release. A release candidate (`vX.Y.Z-rc.N`) is published as a prerelease, and neither a release candidate nor a patch for an older release line moves `latest`.

To release a commit that is not on `main`, such as a hotfix branch, first start the `CI` workflow on that branch from the Actions tab and wait for it to pass.

If a release fails:

- Before the publish job, nothing has been tagged. Fix the cause and start the workflow again.
- During the publish job, re-run the failed job or start the workflow again for the same commit. The workflow reuses the tag, replaces the draft release the failed run left, and applies the image tags again. To release a different commit under the same version instead, delete the tag and the draft release first.

The workflow reads its release logic (`scripts/lib/release-gate.ts` and `scripts/lib/promote-images.sh`) from the branch it runs from, not from the commit being released. Every action in it is pinned to a reviewed commit SHA, and Dependabot proposes updates to those pins.

## Branch Protection

Enable the following protections for `main` inside the GitHub repository settings:

- Require pull request reviews before merging.
- Require status checks to pass before merging. At minimum require the aggregate `CI` job; it runs with `if: always()` and fails unless every job it needs finished with `success` (a failed, cancelled or skipped upstream job fails it). Keep its `needs` list in sync with the other jobs in `.github/workflows/ci.yml`; `scripts/lib/ci-gate.test.ts` enforces this.
- Apply the rules to administrators too ("Do not allow bypassing the above settings" / `enforce_admins`), so a failing gate cannot be merged around.
- Require branches to be up to date before merging.
- Disallow force pushes and direct pushes.

These settings keep `main` deployable and ensure every change follows the release process described above.
