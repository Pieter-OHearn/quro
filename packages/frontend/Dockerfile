FROM oven/bun:1.3.10 AS build
WORKDIR /app

COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
COPY package.json bun.lock bunfig.toml ./
RUN cd packages/frontend && bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/frontend packages/frontend

WORKDIR /app/packages/frontend
RUN bun run build

FROM nginx:1.28.2-alpine3.23
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
