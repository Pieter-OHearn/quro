FROM oven/bun:1.4.2 AS build
WORKDIR /app

COPY packages/shared/package.json packages/shared/
# Bun workspaces include @quro/backend, so copy its manifest too to avoid lockfile churn
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY package.json bun.lock bunfig.toml VERSION ./
RUN cd packages/frontend && bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/frontend packages/frontend

WORKDIR /app/packages/frontend
RUN bun run build

FROM nginx:1.30.3-alpine3.23
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
# nginx renders templates with the environment at startup; only QRO_ settings are substituted,
# so nginx's own variables such as $host stay as they are.
ENV NGINX_ENVSUBST_FILTER=^QRO_
COPY packages/frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 packages/frontend/docker-entrypoint.d/05-require-api-url.sh /docker-entrypoint.d/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
