FROM oven/bun:1 AS build
WORKDIR /app

COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
COPY package.json bunfig.toml ./
RUN cd packages/frontend && bun install

COPY packages/shared packages/shared
COPY packages/frontend packages/frontend

WORKDIR /app/packages/frontend
RUN bun run build

FROM nginx:alpine
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
