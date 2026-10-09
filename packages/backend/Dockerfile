FROM oven/bun:1.4.2 AS base
WORKDIR /app

# Backup and restore need client tools at least as new as the database server, and Debian
# trixie only ships PostgreSQL 17, so install the baseline major from the PGDG repository.
# Keep POSTGRES_CLIENT_MAJOR equal to the major of the `db` image in docker-compose.yml
# (scripts/postgres-baseline.test.ts checks it). The key is pinned by fingerprint.
ARG POSTGRES_CLIENT_MAJOR=18
ARG PGDG_KEY_FINGERPRINT=B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg && \
    install -d /usr/share/postgresql-common/pgdg && \
    curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc && \
    gpg --show-keys --with-colons /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      | awk -F: '$1 == "fpr" { print $10 }' | grep -qx "$PGDG_KEY_FINGERPRINT" && \
    . /etc/os-release && \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends "postgresql-client-${POSTGRES_CLIENT_MAJOR}" && \
    apt-get purge -y --auto-remove curl gnupg && \
    rm -rf /var/lib/apt/lists/* /root/.gnupg

# Bun workspaces include frontend too; copy manifest to keep lockfile consistent
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
COPY package.json bun.lock bunfig.toml ./
RUN cd packages/backend && bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/backend packages/backend
COPY docker/backend docker/backend

RUN chmod +x /app/docker/backend/*.sh /app/docker/backend/quro && \
    ln -s /app/docker/backend/quro /usr/local/bin/quro

WORKDIR /app/packages/backend
ENTRYPOINT ["/bin/sh", "/app/docker/backend/with-runtime-env.sh"]
CMD ["bun", "run", "start"]
EXPOSE 3000
