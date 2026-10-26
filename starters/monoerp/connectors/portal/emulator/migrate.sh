#!/bin/sh
# Applies connectors/portal/emulator/migrations/*.sql to the local portal database as root, standing in for
# "the other team" shipping a change. Each migration is safe to rerun, so all of them run
# every time, as the AWS setup task does (infra/setup/run.sh).
set -eu
cd "$(dirname "$0")/../../.."

for file in connectors/portal/emulator/migrations/*.sql; do
  [ -f "$file" ] || continue
  echo "Applying portal $(basename "$file")"
  docker compose exec -T customer-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot customer_portal' < "$file"
done
echo "Portal migrations up to date."
