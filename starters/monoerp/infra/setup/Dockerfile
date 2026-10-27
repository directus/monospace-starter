# One-off setup task: psql, the MySQL client, Node, and the repo's SQL and setup scripts.
# Built from the repo root; connector folders are discovered at runtime.
FROM node:24-bookworm-slim AS node

FROM postgres:17-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends default-mysql-client \
  && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

WORKDIR /app
RUN npm install --no-save --ignore-scripts zod@4.5.4
COPY package.json package.json
COPY tools/manifest-schema.mjs tools/manifest-schema.mjs
COPY infra/postgres infra/postgres
COPY infra/modules infra/modules
COPY modules modules
COPY starter.json starter.json
COPY infra/manifests.mjs infra/manifests.mjs
COPY connectors connectors
COPY infra/monospace infra/monospace
COPY infra/setup/run.sh run.sh
ENTRYPOINT ["sh", "/app/run.sh"]
