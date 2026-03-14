FROM oven/bun:1.3.10 AS base
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Bun workspaces include frontend too; copy manifest to keep lockfile consistent
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
COPY package.json bun.lock bunfig.toml ./
RUN cd packages/backend && bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/backend packages/backend
COPY docker/backend docker/backend

RUN chmod +x /app/docker/backend/*.sh

WORKDIR /app/packages/backend
CMD ["bun", "run", "start"]
EXPOSE 3000
