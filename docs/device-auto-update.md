# Device Auto-Update

Use this guide if you want a device to stay on the latest GitHub Release of Quro without manual intervention. The workflow relies on prebuilt images that ship with every Release plus a lightweight polling container that runs beside your Compose stack.

## Prerequisites

- Docker Engine 24+ with the Compose v2 plugin (`docker compose` CLI). The helper container talks to the host daemon through `/var/run/docker.sock`.
- Internet access to `ghcr.io`, `api.github.com`, and `github.com`.
- A GitHub personal access token (classic PAT or fine-grained) with `repo:read` if the repository is private. Public repos only require anonymous access but authenticated requests get higher API rate limits.
- (Optional) `bun` or `node` on the host if you want to run `apply-release.sh` manually outside the helper container.

## Bundle Contents

Each GitHub Release attaches `auto-update-bundle-<version>.tar.gz`. When extracted it contains:

- `docker-compose.release.yml` – the manifest pinned to that Release's container images.
- `.env.template` – copy to `.env` and fill in ports and repository settings.
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
3. Authenticate to GHCR on the device:
   ```bash
   echo "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
   ```
4. Start the stack manually once to confirm everything works:
   ```bash
   docker compose -f docker-compose.release.yml pull
   docker compose -f docker-compose.release.yml up -d
   ```

## Enable the Auto-Updater

The `auto-updater` service is hidden behind the `auto-update` profile so it only runs when you opt in.

```bash
docker compose --profile auto-update up -d auto-updater
```

That container mounts the current directory at `/stack`, reads `.env` for repository information, and watches `/var/run/docker.sock` so it can run `docker compose` on your behalf.

By default it checks for a new release every hour. Override with `POLL_INTERVAL` (in seconds) in `.env`:

```
POLL_INTERVAL=86400   # once a day
POLL_INTERVAL=3600    # once an hour (default)
```

Logs appear under `logs/auto-update-*.log` (written by `apply-release.sh`) and also in the container's stdout (`docker compose logs auto-updater`).

## Running Without Docker (Host Cron)

If you prefer to run the update script directly on the host rather than in a container:

```bash
# hourly
0 * * * * cd /opt/quro && ./deploy/auto-update/apply-release.sh >> logs/cron.log 2>&1

# daily at 03:00
0 3 * * * cd /opt/quro && ./deploy/auto-update/apply-release.sh >> logs/cron.log 2>&1
```

With no `--target-tag` flag the script fetches the latest release and only updates when the manifest has changed.

## Troubleshooting

- **docker compose command not found** – install the Compose plugin or expose it by mounting `/usr/lib/docker/cli-plugins` into the helper container.
- **Permission denied on docker socket** – run `auto-updater` as a user in the `docker` group or adjust socket ACLs.
- **API rate-limits** – set `GITHUB_TOKEN` in `.env` so both the helper container and shell script authenticate.
- **Rollbacks** – rerun `deploy/auto-update/apply-release.sh --target-tag v0.0.x` to reapply a previous manifest and restart the stack.

## Keeping the Bundle Fresh

Each Release ships a new bundle. When you update to a new version, re-extract it (overwriting the scripts). The helper container image (`ghcr.io/<owner>/quro-auto-updater`) is versioned with the same tag.
