# Connectors and external sources

A connector is a removable external source. Portal uses Monospace's built-in MySQL provider; Stripe uses a custom extension.

## Add a connector

1. Copy `connectors/portal` for a database provider, or `connectors/stripe` for an API extension, to `connectors/<id>`. Keep only the demo services and frontend features you need.
2. Edit `connector.json`: change the ID, owned paths, source configuration, schema files, source directives, and setup steps. Rename local services and host ports in `compose.yml`. For extensions, update the package name, extension ID, installed directory, and provider ID together.
3. Add the connector ID to a module's envelope `requires` or `x-monoerp.optional`. Leave `OPTIONAL_SOURCES` unset to use that selection. Give real external databases a read-only login.
4. Run the commands below, then `pnpm verify` and browser tests for any frontend components. Setup builds selected extensions automatically.

```sh
pnpm install
pnpm app:doctor
docker compose up -d --wait --wait-timeout 180 --remove-orphans
pnpm setup:all
pnpm generate:routes
pnpm generate
```

Install and dev regenerate `compose.app.yml` automatically. If you edit module or connector folders or Compose declarations without running those commands, run `pnpm compose:sync` before starting Docker. Included Compose paths resolve relative to their own file. Keep optional services out of core's `depends_on`.

## Remove a module, connector, or deploy target

1. Preview with `pnpm app:remove <id> --dry-run`. If the source is already connected, remove its cross-source relations and data source in Studio first. For Stripe, delete Portal's `stripeCustomer` relation before deleting the Stripe source.
2. Run `pnpm app:remove <id>`. Required dependencies prevent removal. For modules and connectors, update `README.md`, `AGENTS.md`, and `docs/` to drop descriptions of the removed feature; shared prose is not rewritten automatically.
3. For modules and connectors, run the same follow-up commands above. `--remove-orphans` retires the removed local service. Source-file removal does not erase existing Docker volumes or external data.

For a deploy target, run `pnpm install`, `pnpm app:doctor`, and `pnpm verify` after removal.

To restore a module, connector, or deploy target, copy its whole folder back, restore any declared package entries, and run those commands again. To keep code but disable a source, set `OPTIONAL_SOURCES` instead.

## Connector contract

| Path or manifest field                       | Purpose                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connector.json`                             | ID, label, ownership, dependencies, source configuration                                                                                                                        |
| `compose.yml` / `compose`, `composeProfiles` | Optional local services and overlays                                                                                                                                            |
| `source`                                     | Provider and connection settings, resolved only by backend setup                                                                                                                |
| `schemaFiles`                                | API names and Studio presentation settings in `monospace/schema/*.json`                                                                                                         |
| `setup.beforeSchema`, `setup.afterSchema`    | Ordered steps relative to `monospace/setup/`; a step's `requires` selects dependencies. Scripts import the shared helpers from `infra/monospace/setup/lib.mjs` by relative path |
| `extension.directory`, `extension.installed` | Extension package and generated install directory                                                                                                                               |
| `migrate`, `provision`                       | Optional scripts relative to the connector folder; `provision` runs in the deployed setup task                                                                                  |
| `frontend`                                   | Optional module features, collections, and connector dependencies; see [UI contract](../docs/modules.md#optional-connector-ui)                                                  |
| `packageEntries`                             | Root package scripts or dependencies removed with this connector                                                                                                                |

Other manifest paths are repository-relative. `pnpm build:extensions` writes selected builds to `infra/monospace/extensions/` and removes stale builds for absent or disabled connectors. Copy extension source, not that generated folder.

| Source value                                             | Meaning                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `{ "env": "NAME", "default": "value" }`                  | Read an environment variable; preserve an explicit empty value; numeric defaults convert ports to numbers |
| `emptyUsesDefault: true`                                 | Treat an empty value as unset                                                                             |
| `{ "when": "NAME", "value": {...}, "otherwise": {...} }` | Choose a value when the variable is nonempty, with an optional fallback                                   |

## Source selection

Unset `OPTIONAL_SOURCES` selects installed modules' required and optional connector IDs. An explicit comma-separated list replaces that selection; empty selects none. Missing folders are always excluded. Compose follows installed folders, so disabling a source does not stop its local service. Removing a backend source in Studio and removing its code are separate actions.

See [app:doctor](../docs/modules.md#how-appdoctor-works).
