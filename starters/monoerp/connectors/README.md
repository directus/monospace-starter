# Connectors and external sources

Each `connectors/<id>/` is a removable piece shared by starters. Stripe uses a custom Monospace extension. Portal uses Monospace's built-in MySQL provider; its emulator is the demo stand-in for another team's read-only database, not CRM-owned storage.

| Path in a piece           | Purpose                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `piece.json`              | `id`, `provides`, supported `env`, source config; optional extension, migration/provision scripts, and setup steps |
| `compose.yml`             | Local services, with paths relative to this folder                                                                 |
| `extension/`              | Custom Monospace extension, when needed                                                                            |
| `emulator/`               | Local stand-in and its data                                                                                        |
| `monospace/schema/*.json` | Source API names and Studio presentation settings                                                                  |

Modules declare required and optional connector IDs in `modules/<id>/piece.json`. Setup selects the installed modules' connectors by default. If set, `OPTIONAL_SOURCES` replaces that selection (comma-separated IDs; empty means none), including explicit sources no installed module uses. A missing folder always wins: source connection, schema settings, and dependent setup steps skip it. `requires: ['portal']` on a module setup step declares such a dependency. Connector manifests can also contribute `beforeSchema`/`afterSchema` steps; Portal owns its native relation names.

Each manifest is the single source for `id`, label and description, `provides`, ownership, Compose, source configuration, setup, and optional `frontend` entries (target module, slot, collections, and conditional connector requirements). `schemaFiles` lists source presentation JSON. Connector-local `extension.directory`, `migrate`, and `provision` paths are relative to the connector folder; setup scripts are relative to `monospace/setup/`. Other paths are repository-relative. The shared schema and ownership checks are described in [modules](../docs/modules.md#piece-manifests).

Source configuration is plain data. `{ "env": "NAME", "default": "value" }` reads an environment variable, preserving an explicit empty string; numeric defaults convert port values to numbers. `emptyUsesDefault: true` treats an empty value as unset. `{ "when": "NAME", "value": {...}, "otherwise": {...} }` selects a branch when the variable is nonempty, omitting the field if no other branch is given. This supports local-versus-hosted configurations and Portal's optional TLS settings. Only setup resolves these values; frontend discovery imports the data reader and shared selection function, never setup runtime. Vite receives only paths for the current CRM organization-panel slot.

## Add a connector

1. Copy `connectors/portal` for a built-in database provider, or `connectors/stripe` for a custom extension, into `connectors/<id>`. Keep only the demo and frontend features your source needs.
2. Update `piece.json`: `id`, label, `ownedPaths`, `compose`, `source`, `env`, schema files, and setup scripts. Rename Compose services/ports and schema source names. For a custom extension, also change its package name, extension ID, `extension.installed`, and `source.provider` together.
3. Add the ID to a module's `requires` or `optional`. Leave `OPTIONAL_SOURCES` unset to use those declarations. If you set an override in `.env`, include the new ID or unset the override; otherwise setup and frontend discovery disable it.
4. Run `pnpm pieces:check`, `pnpm compose:sync`, `pnpm install`, `docker compose up -d --wait --wait-timeout 180`, `pnpm setup:all`, `pnpm generate:routes`, and `pnpm generate`. Built-in providers need no extension build; setup builds custom extensions. Give real external databases a read-only login.

## Remove a piece

Use `pnpm pieces:remove <id> --dry-run` to preview, then remove without the flag. Required dependents prevent removal. The command deletes only existing owned source paths and prints the commands below. Missing `.github` or `.vscode` folders do not block it. If a connector was already connected, remove its relations and data source in Studio before continuing; source files do not retire backend metadata. It does not modify Docker, Monospace, or environment files. Declared `packageEntries` are removed from their package.json files. After copying or removing a piece, run:

```sh
pnpm pieces:check
pnpm compose:sync
pnpm install
docker compose up -d --wait --wait-timeout 180 --remove-orphans
pnpm setup:all
pnpm generate:routes
pnpm generate
```

`compose:sync` reads `compose` and optional `composeProfiles` paths from every installed piece manifest and writes the ignored, generated `compose.pieces.yml`. Root Compose includes it. Run `node infra/compose-sync.mjs` before the first `pnpm install`; `pnpm dev` and setup also sync. Included paths resolve relative to their own compose file ([Docker include reference](https://docs.docker.com/reference/compose-file/include/)). Core services own the shared network; optional services must not become core `depends_on` entries.

Compose runs services for folders that exist; `OPTIONAL_SOURCES` controls source connection, not container startup. Removing a folder and resyncing removes its service from the model; `--remove-orphans` also stops any already-running container. Removing source files does not erase its stored volume or remove a source already registered in Monospace. Disconnect those sources/relations in Studio when retiring them. Setup skips introspection of inactive sources and removes stale generated extension builds.

`pnpm build:extensions` builds selected extension packages into `infra/monospace/extensions/`. That directory is generated output, not another source folder to copy. Keep package names stable when moving a connector. Run `pnpm install` after changing workspace packages.

See [Stripe](stripe/README.md) and [Portal](portal/README.md) for configuration.
