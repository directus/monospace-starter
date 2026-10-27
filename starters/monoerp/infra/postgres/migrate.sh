#!/bin/sh
# Core first, then module-local migrations.
set -eu
export PGHOST="${PGHOST:-app-postgres}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-app}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-app}}"
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
export SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}"
infra_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

# Covers databases created before the ops schema existed.
psql -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS ops;
CREATE TABLE IF NOT EXISTS ops.schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

for dir in "$infra_dir/postgres/core/migrations" "$infra_dir"/modules/*/postgres/migrations; do
  [ -d "$dir" ] || continue
  case "$dir" in
    */postgres/core/migrations) owner=core ;;
    *) owner=$(basename "$(dirname "$(dirname "$dir")")") ;;
  esac
  for file in "$dir"/*.sql; do
    [ -f "$file" ] || continue
    file_name=$(basename "$file")
    name="$owner/$file_name"
    applied=$(echo "SELECT 1 FROM ops.schema_migrations WHERE name = :'name';" | psql -tAq -v name="$name")
    [ "$applied" != 1 ] || continue
    echo "Applying $name"
    psql -v ON_ERROR_STOP=1 -q -f "$file"
    echo "INSERT INTO ops.schema_migrations (name) VALUES (:'name');" | psql -v ON_ERROR_STOP=1 -q -v name="$name"
  done
done
echo "Migrations up to date."
