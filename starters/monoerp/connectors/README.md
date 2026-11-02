# Connectors and external sources

A connector is a removable external source. Portal uses Monospace's built-in MySQL provider; Stripe uses a custom extension.

## Add a connector

1. Copy `connectors/portal` for a database provider, or `connectors/stripe` for an API extension, to `connectors/<id>`. Keep only the demo services and frontend features you need.
2. Edit `connector.json`: label, description, source configuration, setup steps, and `contributes` for module features. The folder name is the ID. Rename local services and host ports in `compose.yml`. For extensions, update the package name, extension ID, and provider ID together.
3. An installed connector is selected. Add its ID to a module's envelope `requires` only if the module cannot run without it. Give real external databases a read-only login.
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
2. Run `pnpm app:remove <id>`. Required dependencies prevent removal. Features of other connectors that need the removed one turn off, and the command says which. For modules and connectors, update `README.md`, `AGENTS.md`, and `docs/` to drop descriptions of the removed feature; shared prose is not rewritten automatically.
3. For modules and connectors, run the same follow-up commands above. `--remove-orphans` retires the removed local service. Source-file removal does not erase existing Docker volumes or external data.

For a deploy target, run `pnpm install`, `pnpm app:doctor`, and `pnpm verify` after removal.

To restore a module, connector, or deploy target, copy its whole folder and `alsoOwns` back, restore its `packageEntries` values, and run those commands again. To keep code but disable a source, set `OPTIONAL_SOURCES` instead.

## Connector contract

The manifest fields are in [docs/modules.md](../docs/modules.md#starter-module-connector-and-deploy-manifests). Everything else is found by path inside the connector folder:

| Path                                           | Purpose                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `connector.json`                               | Label, description, dependencies, `x-monoerp.source`, `setup`, and `contributes`                                                        |
| `compose.yml`                                  | Optional local services                                                                                                                 |
| `monospace/schema/*.json`                      | API names and Studio presentation settings                                                                                              |
| `monospace/setup/<script>`                     | Scripts named by `setup.beforeSources`, `beforeSchema`, and `afterSchema`; they import `infra/monospace/setup/lib.mjs` by relative path |
| `extension/extension.config.json`              | Extension package; installed to `infra/monospace/extensions/<id with / as __>`                                                          |
| `emulator/migrate.sh`, `emulator/provision.sh` | Optional scripts; `provision` runs in the deployed setup task                                                                           |
| `frontend/<module>/feature.tsx`                | The feature declared in `contributes.<module>`; see [UI contract](../docs/modules.md#optional-connector-ui)                             |

`pnpm build:extensions` writes selected builds to `infra/monospace/extensions/` and removes stale builds for absent or disabled connectors. Copy extension source, not that generated folder.

| Source value                                             | Meaning                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `{ "env": "NAME", "default": "value" }`                  | Read an environment variable; preserve an explicit empty value; numeric defaults convert ports to numbers |
| `emptyUsesDefault: true`                                 | Treat an empty value as unset                                                                             |
| `{ "when": "NAME", "value": {...}, "otherwise": {...} }` | Choose a value when the variable is nonempty, with an optional fallback                                   |

## Source selection

Unset `OPTIONAL_SOURCES` selects every installed connector. An explicit comma-separated list replaces that selection; empty selects none. Missing folders are always excluded. Compose follows installed folders, so disabling a source does not stop its local service. Removing a backend source in Studio and removing its code are separate actions.

See [app:doctor](../docs/modules.md#how-appdoctor-works).
