FROM node:24.14.0-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV VP_GIT_HOOKS=0
RUN npm install --global pnpm@11.20.0

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches patches
COPY apps/web/package.json apps/web/package.json
# Optional frontend packages need their workspace dependency links before the app builds.
COPY connectors connectors
# Prepare discovers modules and connectors before the full build source is copied.
COPY starter.json starter.json
COPY modules modules
COPY infra infra
COPY tools/prepare.mjs tools/manifest-schema.mjs tools/
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm --filter @monoerp/web build

FROM node:24.14.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.output ./.output

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
