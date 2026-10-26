# One-off setup task: psql, the MySQL client, Node, and the repo's SQL and setup scripts.
# Built from the repo root; connector folders are discovered at runtime.
FROM node:24-bookworm-slim AS node

FROM postgres:17-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends default-mysql-client \
  && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY infra/postgres infra/postgres
COPY infra/modules infra/modules
COPY modules modules
COPY core core
COPY infra/pieces.mjs infra/pieces.mjs
COPY connectors connectors
COPY infra/monospace infra/monospace
COPY infra/compose-sync.mjs infra/compose-sync.mjs
COPY infra/setup/run.sh run.sh
ENTRYPOINT ["sh", "/app/run.sh"]
