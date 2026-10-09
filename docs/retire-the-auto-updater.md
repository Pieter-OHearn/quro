# Retire the auto-updater

Quro no longer builds, publishes or documents the auto-updater. Releases from 0.8.0 attach neither the update bundle nor `docker-compose.release.yml`, and the `quro-auto-updater` image gets no new tags. Tags and release assets that already exist stay published. Quro itself needs no access to the Docker socket and does not update itself: upgrades are an operator action, as described in the [install contract](install-contract.md#operators-own-orchestration).

Follow this guide if you run Quro 0.6.x or 0.7.0 from a release Compose file and you ever enabled the `auto-update` profile, started the `auto-updater` container, or ran `apply-release.sh` from cron or another scheduler. If you did none of those, there is nothing to retire.

Retiring the updater changes nothing about your stack or your data. The other containers keep running, and `data/`, `.env` and `secrets/` stay where they are. No step below uses `docker compose down`, `-v` or deletes a data directory.

<!-- docs:check skip-paths: deploy/auto-update/, scripts/auto-update/ -->

## Before you start

- Work in the stack directory, the one that holds `docker-compose.release.yml` and `.env`.
- Note which version you run, so you can tell the 0.8.0 upgrade notes where you started. The updater may have replaced the Compose file with a newer manifest, so read the tag from the running stack:

  ```bash
  docker compose -f docker-compose.release.yml images
  ```

## 1. Stop and remove the updater container

The service exists only under the `auto-update` profile, so every command names the profile:

```bash
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep quro-auto-updater
docker compose -f docker-compose.release.yml --profile auto-update stop auto-updater
docker compose -f docker-compose.release.yml --profile auto-update rm -f auto-updater
```

The first command lists the container, if there is one. If it prints nothing, skip to step 2. The other two stop and remove only that service. Use the Compose file name you started it with if it is not `docker-compose.release.yml`. If you started the updater some other way, such as `docker run`, stop and remove it by the name the first command printed: `docker stop <name>` and `docker rm <name>`.

## 2. Stop scheduled jobs and listeners

The updater container polls on its own. Quro does not ship a cron job, timer or webhook listener, but the old guide showed cron lines that ran `deploy/auto-update/apply-release.sh`, and you may have added your own. Look for anything that starts it:

```bash
crontab -l | grep -i -E 'apply-release|auto-update'
sudo crontab -l | grep -i -E 'apply-release|auto-update'
systemctl list-timers --all | grep -i -E 'quro|update'
grep -r -l -i 'auto-update' /etc/cron.d /etc/systemd/system 2>/dev/null
```

Delete each match: edit the crontab with `crontab -e`, or disable the timer or unit with `systemctl disable --now <name>`. If you put a webhook listener or a CI job in front of `apply-release.sh`, remove that as well.

## 3. Revoke what only the updater needed

The updater read `.env` through `env_file`, and `apply-release.sh` read these settings from it:

- `GITHUB_OWNER`, `GITHUB_REPO` and `GITHUB_TOKEN`
- `POLL_INTERVAL`, `STACK_DIR`, `STACK_COMPOSE_FILE` and `APPLY_RELEASE_SCRIPT`

Remove those lines from `.env`. Quro's own services do not read them.

If you created a GitHub access token for the updater, revoke it in GitHub under **Settings → Developer settings → Personal access tokens**. If the updater was its only user and you logged in to the GitHub container registry only for it, run `docker logout ghcr.io`. `quro-backend` and `quro-frontend` pulled anonymously in 0.6.6 and 0.7.0.

## 4. Remove the leftovers (optional)

These files only served the updater. Delete them once the container is gone:

- `deploy/auto-update/` and `scripts/auto-update/` from the extracted bundle
- `.auto-update.lock` and `logs/auto-update-*.log`

Keep `docker-compose.release.yml`, `.env`, `secrets/` and `data/`. You can also delete the `auto-updater` service block from your copy of the Compose file; Compose ignores it unless the profile is enabled.

## 5. Check

```bash
docker compose -f docker-compose.release.yml --profile auto-update ps -a
docker compose -f docker-compose.release.yml --profile auto-update ps -q | xargs -r docker inspect --format '{{.Name}} {{range .Mounts}}{{.Source}} {{end}}' | grep docker.sock
```

The first command lists your stack without an `auto-updater` entry. The second prints nothing: no container in the stack mounts the Docker socket. Other containers on the host, such as a reverse proxy, may legitimately mount it; that is not part of Quro.

## After retiring

The stack stays on the version it runs now. Nothing checks for new releases, so watch the [releases page](https://github.com/Pieter-OHearn/quro/releases) and follow the upgrade notes of each release. The updater's rollback command, `apply-release.sh --target-tag`, goes away with it; to go back, set the earlier image tag in your Compose file and recreate the services.
