# Portal external source

This piece uses Monospace's built-in MySQL connector. It owns the local `customer-mysql` stand-in, its demo schema/data/migrations under `emulator/`, and source presentation settings under `monospace/schema/portal.json`. CRM owns the relations that join its records to portal data.

`monospace/setup/portal-source-relations.mjs` names Portal's native relations, independently of CRM. The source schema marks cross-source presentation entries as `optionalRelations`, so absent CRM or Stripe joins do not prevent Portal setup. Schema export preserves these entries until the joins are present again.

Monospace connects as `monospace_reader` with `SELECT` only. Point `CUSTOMER_MYSQL_HOST` and `CUSTOMER_MYSQL_INTERNAL_PORT` at another team's existing server to use real data, with `PORTAL_READER_PASSWORD` for its read-only login. Local Compose uses `CUSTOMER_MYSQL_PORT` and `CUSTOMER_MYSQL_ROOT_PASSWORD` for the demo server; setup's manifest lists all supported environment variables.

Local migrations only update this demo stand-in, acting as the external team's schema changes. `pnpm db:migrate` discovers this piece's migration script. AWS's setup image dispatches `emulator/provision.sh` for its demo database; that script is part of this piece too. The provisioning script requires `PORTAL_DEMO_DATABASE=1`, which AWS sets only for its own demo RDS. A host alone never enables provisioning, and the script never drops the database. Never enable this flag or apply demo migrations against another team's real database.

Portal is installed and selected by default to demonstrate Monospace joining PostgreSQL with read-only MySQL. It is optional for CRM. Its `frontend/crm/` folder owns the organization Portal tab, list plan/seat/renewal/ticket columns and filters, contact panel/summary, deal plan summary, and read-only activity history. The piece manifest contributes its collection requirements only when selected. All source reads stay in this folder.

To remove the demo:

```sh
pnpm pieces:remove portal --dry-run
pnpm pieces:remove portal
```

Then follow the [shared removal steps](../README.md#remove-a-piece). Removing source files does not retire an existing Monospace source or erase database volumes. CRM keeps working without Portal collections. Stripe can stay installed, but its CRM Billing feature stays inactive because it requires Portal accounts. Typecheck and tests exclude both inactive frontend features. To restore Portal, copy the whole folder, reinstall workspace packages, and follow [piece setup](../README.md).
