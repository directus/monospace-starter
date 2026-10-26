#!/bin/sh
# Provisions only the deployed demo stand-in, with the same SQL as local Compose.
set -eu
[ "${PORTAL_DEMO_DATABASE:-}" = 1 ] || exit 0
[ -n "${CUSTOMER_MYSQL_HOST:-}" ] || { echo "Portal demo host is required" >&2; exit 1; }

echo "== Portal database"
export MYSQL_PWD="$MYSQL_ADMIN_PASSWORD"
portal() { mysql --ssl -h "$CUSTOMER_MYSQL_HOST" -u "$DB_ADMIN_USER" "$@"; }
empty=$(portal -N -e "SELECT COUNT(*) = 0 FROM information_schema.tables WHERE table_schema = 'customer_portal' AND table_name = 'accounts'")
if [ "$empty" = 0 ] && [ "$SEED_DEMO_DATA" = true ]; then
  empty=$(portal -N customer_portal -e 'SELECT COUNT(*) = 0 FROM accounts')
fi
if [ "$empty" = 1 ]; then
  echo "Empty database, loading the schema (demo data: $SEED_DEMO_DATA)"
  portal -e 'CREATE DATABASE IF NOT EXISTS customer_portal'
  portal customer_portal < connectors/portal/emulator/init/001_schema.sql
  if [ "$SEED_DEMO_DATA" = true ]; then
    portal customer_portal < connectors/portal/emulator/init/002_seed.sql
  fi
fi
for file in connectors/portal/emulator/migrations/*.sql; do
  [ -f "$file" ] || continue
  portal customer_portal < "$file"
done
# Same user as connectors/portal/emulator/init/003_reader.sh, with the password kept in sync.
portal <<SQL
CREATE USER IF NOT EXISTS 'monospace_reader'@'%' IDENTIFIED BY '$PORTAL_READER_PASSWORD';
ALTER USER 'monospace_reader'@'%' IDENTIFIED BY '$PORTAL_READER_PASSWORD';
GRANT SELECT ON customer_portal.* TO 'monospace_reader'@'%';
SQL
