FROM oven/bun:1 AS base
WORKDIR /app

COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY package.json bunfig.toml ./
RUN cd packages/backend && bun install

COPY packages/shared packages/shared
COPY packages/backend packages/backend

WORKDIR /app/packages/backend
CMD ["sh", "-c", "bun run db:migrate && bun run start"]
EXPOSE 3000
