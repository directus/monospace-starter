#!/bin/sh
# Brings a stage's databases and Monospace workspace to the state a local `docker compose up`
# plus `pnpm setup:all` produces. Every step is safe to rerun.
set -eu
cd /app

echo "== Shared database"
export PGHOST="$APP_DB_HOST" PGDATABASE="$APP_DB_NAME" PGSSLMODE=require
# pgvector needs the admin; everything else runs as the app user so it owns the tables.
PGUSER="$DB_ADMIN_USER" PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" \
  psql -v ON_ERROR_STOP=1 -qc 'CREATE EXTENSION IF NOT EXISTS vector'
export PGUSER="$APP_DB_USER" PGPASSWORD="$APP_DB_PASSWORD"
if [ -z "$(psql -tAc "SELECT to_regclass('ops.schema_migrations')")" ]; then
  echo "Empty database, loading installed modules (demo data: $SEED_DEMO_DATA)"
  sh infra/postgres/init.sh
fi
sh infra/postgres/migrate.sh

node infra/monospace/setup/connector-hook.mjs provision

echo "== Monospace workspace"
NODE_ENV=production node infra/monospace/setup/setup.mjs
