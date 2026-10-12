# Uninstall Quro

This page removes an install made with [the install guide](install.md), in steps: stop it and keep everything, remove the containers and keep the data, or delete it all. Run the commands in the directory that holds `compose.yaml`. Nothing here is undone by Quro itself: deleted data comes back only from a backup.

## Stop and keep everything

```bash
docker compose stop
```

The containers stay, and `docker compose start` or `docker compose up -d` brings Quro back as it was.

## Remove the containers and keep the data

<!-- quickstart:uninstall-keep -->

```bash
docker compose down
```

This removes the containers and the Compose networks. It keeps the database volume (`quro_postgres`), `config/`, `data/documents/` and `backups/`. `docker compose up -d` later starts Quro again with the same data and accounts. You can also remove the images to free disk space; the next `up -d` pulls them again:

```bash
docker image rm ghcr.io/pieter-ohearn/quro-backend:v0.8.0 ghcr.io/pieter-ohearn/quro-frontend:v0.8.0 postgres:18.6-alpine3.23
```

Use the tags in your `compose.yaml`, and leave out `postgres` if other containers on the host use that image.

## Delete everything

Before you delete your data, take a last backup and copy it, with `config/`, to another device, in case you want it back:

```bash
docker compose run --rm migrate backup --label final
```

Then remove the containers, the networks and the database volume:

<!-- quickstart:uninstall-delete -->

```bash
docker compose down --volumes
```

The database is gone at this point. What is left is the install directory: `compose.yaml`, `config/` with the settings and the database passwords, `data/documents/` and `backups/`. Delete it from the directory above it:

```bash
cd ..
rm -rf quro
```

On Linux, files written by the backend belong to UID 1000. Unless that is your UID, prefix `rm` with `sudo`.

## Outside the install directory

`docker compose down --volumes` and deleting the directory remove only what the install created. Remove the rest yourself:

- **Your own PostgreSQL server:** drop the database and both roles, as a superuser: `drop database quro;`, then `drop role quro_app;` and `drop role quro_admin;` (use your names from `config/quro.env`).
- **Your S3-compatible store:** delete the objects and the bucket, and the access key, with the store's own tools.
- **A reverse proxy:** remove Quro's site from its configuration. A proxy that ran as the `proxy` service is removed with the containers; its `caddy` volume goes with `--volumes`.
- **bunq:** revoke Quro's access in the bunq app, and delete the OAuth client if you created it only for Quro.
- **Scheduled backups and off-device copies:** remove the cron job or timer, and delete the copies when you no longer need them.
