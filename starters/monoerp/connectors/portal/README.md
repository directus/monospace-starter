# Portal external source

Portal is the optional read-only MySQL demo. It adds account, plan, seat, ticket, and usage data to CRM through Monospace's built-in provider.

## Use Portal

1. Keep or copy the whole `connectors/portal` folder. An installed connector is selected unless `OPTIONAL_SOURCES` leaves it out.
2. For the bundled demo, keep the local defaults. Its MySQL host port is 3307 unless `pnpm install` picked another; see `CUSTOMER_MYSQL_PORT` in `.env`. For an existing server, set `CUSTOMER_MYSQL_HOST`, `CUSTOMER_MYSQL_INTERNAL_PORT`, and `PORTAL_READER_PASSWORD` in `.env`. Set `source.user` and `source.dbname` in `connector.json` to your read-only login and database.
3. Adapt `monospace/schema/portal.json`, `connectors/portal/monospace/setup/portal-relations.mjs`, and the feature's queries if your tables differ.
4. Run the [shared setup commands](../README.md#add-a-connector), then `pnpm verify` and browser tests for any UI changes.

## Remove Portal

Preview with `pnpm app:remove portal --dry-run`, then follow the [shared removal steps](../README.md#remove-a-module-connector-or-deploy-target). CRM keeps working and retains its stored Portal account link. With Stripe installed, its Billing feature turns off and the command says so. Restore the whole folder and run shared setup to reconnect it.

## Portal contract

| Path or setting                                       | Purpose                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `connector.json`                                      | Built-in MySQL provider, connection settings, source schema, and frontend declarations |
| `emulator/init/`                                      | Demo schema and seed                                                                   |
| `emulator/migrations/`                                | Changes to the demo stand-in, run by `pnpm db:migrate`                                 |
| `emulator/provision.sh`                               | AWS demo setup, enabled only with `PORTAL_DEMO_DATABASE=1`                             |
| `monospace/schema/portal.json`                        | API names, presentation, and optional cross-source relations                           |
| `monospace/setup/portal-reader.mjs`                   | Creates the local `SELECT`-only `monospace_reader` login before Portal is connected    |
| `monospace/setup/portal-source-relations.mjs`         | Native relation names, usable independently of CRM                                     |
| `frontend/crm/`                                       | Portal tab, list columns/filters, contact panel, deal summary, and read-only history   |
| `CUSTOMER_MYSQL_PORT`, `CUSTOMER_MYSQL_ROOT_PASSWORD` | Local demo server settings                                                             |
| `DB_SSL_MODE`                                         | TLS mode for a hosted database                                                         |

Demo migrations and provisioning act as the external team's schema changes. Apply them only to the stand-in. Never enable demo provisioning or run those migrations against another team's real database. Provisioning requires the explicit demo flag and never drops a database.

See [app:doctor](../docs/modules.md#how-appdoctor-works).
