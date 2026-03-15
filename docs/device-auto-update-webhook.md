# Device Auto-Update Webhook

Use this guide if you want a personal device to stay on the latest GitHub Release of Quro without recloning the repository. The workflow relies on prebuilt images that ship with every Release plus a lightweight webhook listener that can run beside your Compose stack.

## Prerequisites

- Docker Engine 24+ with the Compose v2 plugin (`docker compose` CLI). The helper container talks to the host daemon through `/var/run/docker.sock`.
- Internet access to `ghcr.io`, `api.github.com`, and `github.com`.
- A GitHub personal access token (classic PAT or fine-grained) with `repo:read` if the repository is private. Public repos only require anonymous access but authenticated requests get higher API limits.
- A publicly reachable HTTPS endpoint for GitHub to POST to. This can be a reverse proxy, tunnel (Cloudflare/Zrok/etc.), or any existing load balancer that forwards to your device.
- (Optional) `bun` or `node` on the host if you want to run `apply-release.sh` manually outside the helper container.

## Bundle Contents

Each GitHub Release attaches `auto-update-bundle-<version>.tar.gz`. When extracted it contains:

- `docker-compose.release.yml` – the manifest pinned to that Release’s container images.
- `.env.template` – copy to `.env` and fill in ports, GHCR credentials, and webhook settings.
- `secrets/*.example` – copy to `secrets/*.txt` and set secure values.
- `deploy/auto-update/apply-release.sh` – lock + update wrapper.
- `scripts/auto-update/fetch-release.js` – compiled script that downloads the newest manifest via the GitHub API.
- This documentation file.

Place these files somewhere durable (for example `/opt/quro`). The examples below assume that directory is your stack root.

## Initial Bootstrap

1. Extract the bundle into `/opt/quro` and run:
   ```bash
   cd /opt/quro
   cp .env.template .env
   for file in secrets/*.example; do cp "$file" "${file%.example}"; done
   chmod 600 .env secrets/*.txt
   ```
2. Edit `.env` and secrets to include:
   - `GITHUB_OWNER` / `GITHUB_REPO`
   - `GITHUB_TOKEN` (optional for public repos, required for private orgs)
   - `RELEASE_WEBHOOK_SECRET`
   - `STACK_DIR=/stack` only if you need a different mount path inside the helper container
3. Authenticate to GHCR on the device:
   ```bash
   echo "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
   ```
4. Start the stack manually once to confirm everything works:
   ```bash
   docker compose -f docker-compose.release.yml pull
   docker compose -f docker-compose.release.yml up -d
   ```

## Enable the Webhook Helper

The `release-webhook` service is hidden behind the `auto-update` profile so it only runs when you opt in.

```bash
docker compose --profile auto-update up -d release-webhook
```

That container mounts the current directory at `/stack`, reads `.env` for repository information, and watches `/var/run/docker.sock` so it can run `docker compose` on your behalf. Logs appear under `logs/auto-update-*.log`.

### Register the GitHub Webhook

1. In GitHub, open `Settings → Webhooks → Add webhook`.
2. Set **Payload URL** to your HTTPS endpoint (the helper listens on `/` and default port `9002`).
3. Set **Content type** to `application/json`.
4. Provide the **Secret** value that matches `RELEASE_WEBHOOK_SECRET` in `.env`.
5. Choose “Let me select individual events” and tick **Release** (published). Save the webhook.
6. GitHub will send a `ping` event immediately. Check the helper logs for `Release webhook listening...` followed by a `queued` response.

Whenever a Release is published, GitHub POSTs `release`/`published`. The helper verifies the signature, calls `deploy/auto-update/apply-release.sh --target-tag <tag>`, and the script downloads the matching `docker-compose.release.yml`, pulls images, and restarts the stack.

## Running Without Webhooks (Polling Mode)

If you cannot expose a webhook endpoint, schedule the shell script:

```bash
*/30 * * * * cd /opt/quro && ./deploy/auto-update/apply-release.sh >> logs/cron.log 2>&1
```

With no `--target-tag` flag the script fetches the latest Release and only updates when the manifest has changed.

## Troubleshooting

- **Signature mismatch** – ensure the `RELEASE_WEBHOOK_SECRET` inside `.env` matches the value configured in GitHub. Rotate both sides if unsure.
- **docker compose command not found** – install the Compose plugin or expose it by mounting `/usr/lib/docker/cli-plugins` into the helper container.
- **Permission denied on docker socket** – run `release-webhook` as a user in the `docker` group or adjust socket ACLs. The provided Compose snippet runs the helper as root, which works out of the box.
- **API rate-limits** – set `GITHUB_TOKEN` in `.env` so both the helper container and shell script authenticate.
- **Rollbacks** – rerun `deploy/auto-update/apply-release.sh --target-tag v0.0.x` to reapply a previous manifest and restart the stack.

## Keeping the Bundle Fresh

Each Release ships a new bundle. When you update to a new version, re-extract it (overwriting the scripts) or run `git pull` if you cloned the repo. The helper container image (`ghcr.io/<owner>/quro-release-webhook`) is versioned with the same tag so you can opt in via `docker compose --profile auto-update up -d release-webhook` without manual rebuilds.
