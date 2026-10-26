#!/bin/sh
# Core first, then module-local migrations.
set -eu
export PGHOST="${PGHOST:-crm-postgres}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-crm}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-crm}}"
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
export SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}"
infra_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

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
    legacy=$(basename "$file")
    name="$owner/$legacy"
    applied=$(echo "SELECT 1 FROM ops.schema_migrations WHERE name = :'name';" | psql -tAq -v name="$name")
    [ "$applied" != 1 ] || continue
    if [ "$applied" != 1 ]; then
      echo "Applying $name"
      psql -v ON_ERROR_STOP=1 -q -f "$file"
    fi
    echo "INSERT INTO ops.schema_migrations (name) VALUES (:'name');" | psql -v ON_ERROR_STOP=1 -q -v name="$name"
  done
done
echo "Migrations up to date."
