FROM oven/bun:1.4.3 AS build
WORKDIR /app

COPY packages/shared/package.json packages/shared/
# Bun workspaces include @quro/backend, so copy its manifest too to avoid lockfile churn
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY package.json bun.lock bunfig.toml VERSION ./
RUN bun install --frozen-lockfile --filter @quro/frontend

COPY packages/shared packages/shared
COPY packages/frontend packages/frontend

WORKDIR /app/packages/frontend
RUN bun run build

FROM nginx:1.30.3-alpine3.23
# Security updates published since the base image was built. The stock server configuration is
# replaced by the template below.
RUN apk upgrade --no-cache && rm /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
# nginx runs unprivileged and writes only below /tmp: the pid file, temporary files and the
# server configuration rendered from the template at startup.
COPY packages/frontend/nginx-main.conf /etc/nginx/nginx.conf
# nginx renders templates with the environment at startup; only QRO_ settings are substituted,
# so nginx's own variables such as $host stay as they are.
ENV NGINX_ENVSUBST_FILTER=^QRO_ \
    NGINX_ENVSUBST_OUTPUT_DIR=/tmp/nginx/conf.d
COPY packages/frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 packages/frontend/docker-entrypoint.d/ /docker-entrypoint.d/
# The image's nginx user; any other UID works through --user, and the root filesystem can be
# read-only with /tmp as tmpfs. Port 80 needs no capability: Docker lets unprivileged processes
# bind low ports inside the container's network namespace.
USER 101:101
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]
CMD ["nginx", "-g", "daemon off;"]
