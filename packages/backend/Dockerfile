# Production dependencies of the backend workspace only: no frontend, build, lint or test tooling.
FROM oven/bun:1.4.4-slim AS deps
WORKDIR /app
# Bun workspaces include frontend too; copy every manifest to keep the lockfile consistent
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production --filter @quro/backend

# Application source without tests and test helpers.
FROM oven/bun:1.4.4-slim AS source
WORKDIR /app
COPY packages/shared packages/shared
COPY packages/backend packages/backend
RUN rm -rf packages/shared/test packages/backend/src/test packages/backend/drizzle.config.ts && \
    find packages \( -name '*.test.ts' -o -name '*.cases.ts' \) -delete

FROM oven/bun:1.4.4-slim
WORKDIR /app

# Backup and restore need client tools at least as new as the database server, and Debian
# trixie only ships PostgreSQL 17, so install the baseline major from the PGDG repository.
# Keep POSTGRES_CLIENT_MAJOR equal to the major of the `db` image in docker-compose.yml
# (scripts/postgres-baseline.test.ts checks it). The repository's signing key is pinned by
# fingerprint. Security updates published since the base image was built are applied too.
ARG POSTGRES_CLIENT_MAJOR=18
ARG PGDG_FINGERPRINT=B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8
RUN apt-get update && \
    apt-get upgrade -y --no-install-recommends && \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg && \
    install -d /usr/share/postgresql-common/pgdg && \
    curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc && \
    gpg --show-keys --with-colons /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      | awk -F: '$1 == "fpr" { print $10 }' | grep -qx "$PGDG_FINGERPRINT" && \
    . /etc/os-release && \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends "postgresql-client-${POSTGRES_CLIENT_MAJOR}" && \
    apt-get purge -y --auto-remove curl gnupg && \
    rm -rf /var/lib/apt/lists/* /root/.gnupg

COPY --from=deps /app /app
COPY --from=source /app/packages /app/packages
COPY docker/backend docker/backend
COPY VERSION /app/VERSION

# `quro version` reports the commit the image was built from; release builds pass it in.
ARG QRO_IMAGE_REVISION=unknown

# The data directories belong to UID 1000, so a new named volume mounted there is writable
# without a chown. /var/lib/quro stays traversable for any --user with its own bind mounts.
# The database backup scripts write under /app/backups, which points into the backup directory.
RUN chmod +x /app/docker/backend/*.sh /app/docker/backend/quro && \
    ln -s /app/docker/backend/quro /usr/local/bin/quro && \
    printf '%s\n' "$QRO_IMAGE_REVISION" > /app/REVISION && \
    install -d -m 0755 /var/lib/quro && \
    install -d -o 1000 -g 1000 -m 0750 /var/lib/quro/documents /var/lib/quro/backups && \
    ln -s /var/lib/quro/backups /app/backups

WORKDIR /app/packages/backend
# Unprivileged by default; any other UID works through --user (no passwd entry needed). At runtime
# only /tmp and the data directories are written, so the container also runs with a read-only
# root filesystem and /tmp as tmpfs.
USER 1000:1000
EXPOSE 3000
# Readiness: database, schema and document store (docs/install.md#readiness).
HEALTHCHECK --interval=10s --timeout=6s --start-period=10s --retries=6 CMD ["quro", "health"]
# Every task is a `quro` subcommand: `docker run <image> migrate`, `... doctor`, and so on.
ENTRYPOINT ["quro"]
CMD ["serve"]
