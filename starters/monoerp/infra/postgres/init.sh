#!/bin/sh
# Core first, then each installed module. The same loader runs in Compose and the setup task.
set -eu
infra_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
export PGUSER="${PGUSER:-${POSTGRES_USER:-app}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-app}}"
export SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}"
for dir in "$infra_dir/postgres/core/init" "$infra_dir"/modules/*/postgres/init; do
  for file in "$dir"/*.sql; do
    [ -f "$file" ] || continue
    case "$file" in *seed*) [ "$SEED_DEMO_DATA" = true ] || continue ;; esac
    psql -v ON_ERROR_STOP=1 -q -f "$file"
  done
done
