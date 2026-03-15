FROM oven/bun:1.1.34-debian

RUN apt-get update && \
    apt-get install -y --no-install-recommends docker.io docker-compose-plugin ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY deploy/auto-update deploy/auto-update
COPY deploy/release-webhook deploy/release-webhook
COPY scripts/auto-update scripts/auto-update

RUN chmod +x deploy/auto-update/apply-release.sh

EXPOSE 9002

ENTRYPOINT ["bun", "run", "deploy/release-webhook/server.ts"]
