FROM node:24.14.0-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV VP_GIT_HOOKS=0
RUN npm install --global pnpm@11.20.0

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# pnpm checks every patch listed in pnpm-workspace.yaml, even for packages this image skips.
COPY patches patches
COPY apps/web/package.json apps/web/package.json
# Optional frontend packages need their workspace dependency links before the app builds.
COPY connectors connectors
# The root package's prepare script runs during install.
COPY tools/prepare.mjs tools/prepare.mjs
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
# The full source adds workspace packages the install above skipped, so pnpm's pre-run check
# would reinstall, and fail on the alchemy patch (infra/aws is dockerignored).
RUN pnpm --config.verify-deps-before-run=false --filter @monoerp/web build

FROM node:24.14.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.output ./.output

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
