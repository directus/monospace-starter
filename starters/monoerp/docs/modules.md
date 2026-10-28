# Modules

Add business areas next to CRM without editing the shell. A module is one folder, `modules/<id>`, and uses the workspace and app database from the shared setup.

## Add a module

Use CRM as the working example for a new `inventory` module:

Copy `modules/crm` to `modules/<id>`. Inside it:

| Path                                            | Contains                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `module.json`                                   | Module manifest                                                                       |
| `package.json`                                  | The npm packages the module imports directly, with `catalog:` versions                |
| `module.ts`, `*.ts`, `components/`, `settings/` | UI entry, copy, reads, writes, and tests                                              |
| `modules/<id>/routes/app`                       | Pages, mounted at `/<id>`                                                             |
| `modules/<id>/routes/settings`                  | Settings pages, mounted at `/settings/<id>` inside the settings layout                |
| `modules/<id>/routes/public`                    | Optional pages outside the signed-in shell, mounted at the site root (a careers site) |
| `modules/<id>/infra/postgres`                   | SQL schema, migrations, and demo data                                                 |
| `modules/<id>/infra/monospace`                  | Schema settings (`schema/`) and setup scripts (`setup/`)                              |

1. Replace the copied CRM IDs, imports, tables, demo records, queries, and tests with your module's data. Module code imports itself as `@/modules/<id>/...`; core as `@/...`. Put SQL in `infra/postgres/{init,migrations}/` and schema settings in `modules/<id>/infra/monospace/schema/`. Use the existing app database; see [schema changes](data-model.md#changing-the-schema).
2. Edit `modules/<id>/module.json`: label, description, collections, `writes`, audit columns, and setup steps. The folder name is the ID; schema files, setup scripts, and routes are found by their folder.
3. Rename `crm.copy.ts` to `inventory.copy.ts` and edit it with `module.ts`. Export a `ModuleEntry`, use `id: 'inventory'` and `basePath: '/inventory'`, and add `inventory: true` to `ModuleRegistry` through declaration merging. The registry discovers `modules/*/module.ts` automatically.
4. Update each page's `createFileRoute` path and links, then set `staticData.page`: set `module`, `title`, and `icon`; add `nav` for sidebar pages and `parent` for detail pages. Use `index.tsx` for `/<id>` and `items_.$itemId.tsx` for a detail page outside the list layout. Follow [frontend conventions](frontend.md).
5. Add search or settings only if needed. Copy `search.ts` for search. Settings pages go in `modules/<id>/routes/settings/` and appear under `/settings/<id>/` and in the settings sidebar automatically.
6. Run `pnpm app:doctor`, `pnpm db:migrate`, `pnpm setup:all`, `pnpm generate:routes`, and `pnpm generate`.
7. Run `pnpm verify` (plus browser tests for components). Open the module and check its sidebar group, home card, breadcrumbs, and command-palette entries.

## Remove a module

Preview with `pnpm app:remove crm --dry-run`, then run `pnpm app:remove crm` and the [shared removal steps](../connectors/README.md#remove-a-module-connector-or-deploy-target). Connectors remain installed until removed separately.

## Starter, module, connector, and deploy manifests

A part is one folder: `modules/<id>`, `connectors/<id>`, or `deploy/<id>`. The folder name is the ID and the parent folder is the kind. Each part folder holds its manifest (`module.json`, `connector.json`, or `deploy.json`); a folder without one fails `pnpm app:doctor`. A part owns its whole folder. The starter (`starter.json`) owns every other path and cannot be removed.

Manifests declare only what cannot be found on disk. Two layers:

| Envelope field (read by the CLI) | Contract                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `$schema`                        | `https://monospace.io/schemas/starter/v1/<kind>.json`; kind and contract version                 |
| `label`, `description`           | Shown when picking parts                                                                         |
| `requires`                       | Part IDs that must stay installed; they block removal                                            |
| `alsoOwns`                       | Root files outside the folder that go with the part (a workflow, a patch); cannot overlap a part |
| `packageEntries`                 | `{ file, section, entries }`: exact values in a root package or workspace file, removed with it  |

`starter.json` has `$schema`, `label`, `description`, `ignorePaths` (not copied when creating an app), and `nextSteps.create` / `nextSteps.remove`: the commands the CLI prints afterwards, as package scripts (`{ "script": "setup:all" }`) or argument lists (`{ "command": ["cp", "-n", ".env.example", ".env"] }`). `"when": "choices-changed"` marks steps needed only when parts were left out.

### `x-monoerp` runtime settings

The CLI never reads `x-monoerp`; `tools/manifest-schema.mjs` validates it.

| Field                                     | Contract                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `collections`, `writes`                   | Module API collections, and the ones that need write schemas                                             |
| `auditColumns`                            | SQL columns per table linked to Monospace users                                                          |
| `setup.beforeSchema`, `setup.afterSchema` | Ordered steps; each has a title and a script file name in the part's `monospace/setup/` folder           |
| Setup step `requires`                     | Skip unless each named module is installed or connector is selected                                      |
| `demoUserCredential`                      | Module only: AWS secret name for the deployed demo users' shared password                                |
| `source`                                  | Connector only: provider and connection settings                                                         |
| `contributes.<module>`                    | Connector only: a feature for that module, with its `collections` and the other connectors it `requires` |

### Found by convention

Paths are relative to the part folder.

| Part   | Path                                                     | Meaning                                                      |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------ |
| Module | `module.ts`                                              | UI entry (required)                                          |
| Module | `routes/<kind>/`                                         | `app` pages at `/<id>`, `settings` pages at `/settings/<id>` |
| Module | `infra/postgres/{init,migrations}`                       | SQL and demo data                                            |
| Module | `infra/monospace/schema/*.json`, `infra/monospace/setup` | Schema settings files and setup scripts                      |
| Any    | `compose.yml`                                            | Local services                                               |
| Deploy | `lint/config.ts`                                         | Vite+ lint fragment                                          |

Connector paths are in the [connector contract](../connectors/README.md#connector-contract); `OPTIONAL_SOURCES` in [Source selection](../connectors/README.md#source-selection).

## The UI contract

A module UI entry is a `ModuleEntry` (`apps/web/src/lib/modules/types.ts`):

| Field         | What it does                                                      |
| ------------- | ----------------------------------------------------------------- |
| `id`          | A `ModuleId`. Pages point at it with `page.module`                |
| `order`       | Sidebar, home, and settings order (lower first)                   |
| `label`       | The sidebar group heading, the module's breadcrumb, its home card |
| `description` | The line under the module's card on the home page                 |
| `icon`        | The home card icon                                                |
| `basePath`    | The module's landing page (`/crm`). Breadcrumbs link to it        |
| `search`      | Optional. Scopes and a search function for the command palette    |

`apps/web/src/lib/modules/index.ts` discovers default exports from `modules/*/module.ts` with an eager Vite glob, sorted by `order`. It exports `modules` and `moduleById`. Each UI entry adds its own key to `ModuleRegistry` through TypeScript declaration merging; `ModuleId` is `keyof ModuleRegistry`. Deleting the module folder removes both its runtime registration and its ID type. The CRM's UI entry is `modules/crm/module.ts`.

The settings sidebar lists each module's routes under `/settings/<id>/`, grouped under the module label; route `staticData.page` owns each title and icon. CRM owns only its PostgreSQL collections. Portal's optional feature owns its MySQL collections; Stripe's optional feature owns its Stripe collections.

## Routes

The app uses TanStack Router's file-based routing with a virtual root (`apps/web/routes.ts`): core pages are listed from `apps/web/src/routes`, and every module folder with a `module.json` is mounted from its own `routes/` folders. `modules/<id>/routes/app` mounts under the signed-in layout at `/<id>`, `modules/<id>/routes/settings` under the settings layout at `/settings/<id>`, and `modules/<id>/routes/public` at the site root with no prefix. File names inside each folder follow the usual conventions (`index.tsx`, `items.tsx`, `items_.$itemId.tsx`). The generator rewrites each file's `createFileRoute` path, so copied files fix themselves on the next `pnpm dev` or `pnpm generate:routes`. The routes directory is the repository root, set in `apps/web/vite.config.ts` for the dev server and build and in `apps/web/tsr.config.json` for `tsr generate`; keep the two in sync.

Modules are pnpm workspace packages (`modules/*` in `pnpm-workspace.yaml`), so each lists the npm packages it imports directly in its own `package.json`, with versions from the root catalog. They are not dependencies of the web app: the app finds them by glob, and nothing may depend on a module with `workspace:`, so deleting a module folder leaves a consistent install. The `@/modules/*` import path maps to `modules/*` in `apps/web/tsconfig.json`, which Vite reads too.

## Page metadata

Pages describe themselves in the route's `staticData.page` (`PageMeta` in `lib/modules/types.ts`). `usePages()` (`lib/modules/pages.ts`) collects every route that has one and no URL params, sorted by `nav`.

| Field         | Used by                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `recordTitle` | Optional `(queryClient, params) => string \| undefined` for a cached detail name. Updates the breadcrumb and browser tab after record edits. Return `undefined` while the detail cache is empty. |
| `title`       | Sidebar, breadcrumbs, command palette                                                                                                                                                            |
| `icon`        | Sidebar and command palette                                                                                                                                                                      |
| `module`      | Which sidebar group and home card the page belongs to, and the module breadcrumb                                                                                                                 |
| `nav`         | Present means the page is in the sidebar. The number sets the order                                                                                                                              |
| `parent`      | For detail pages: the list page shown as the middle breadcrumb                                                                                                                                   |
| `keywords`    | Extra words the command palette matches on                                                                                                                                                       |
| `fullWidth`   | Drops the content max width (wide tables, boards)                                                                                                                                                |
| `fill`        | Pins the content to the viewport height so the page's own scroller fills it                                                                                                                      |

Examples: a list page is `modules/crm/routes/app/organizations.tsx` (`nav`, `fullWidth`, `fill`, `keywords`). A detail page is `modules/crm/routes/app/organizations_.$organizationId.tsx` (`module` and `parent`, no `nav`).

Where it's read:

- **Sidebar** (`shell/app-sidebar.tsx`): one group per module, listing its pages that have `nav`. Clicking a group's label collapses it; closed groups are remembered in localStorage (`shell/use-nav-groups.ts`), going to a page in a closed group opens it, and the icon-only sidebar always shows every page.
- **Breadcrumbs** (`AppHeader` in `shell/app-shell.tsx`): home, then the module (linking to `basePath`), then `parent` if set, then the page. On phones the middle crumbs hide. Detail routes supply `page.recordTitle` to read their existing detail query from the cache with `getQueryData(detailQuery(id).queryKey)`. This never fetches; the existing loader and detail component own loading. The shell subscribes to cache updates, shows a placeholder until the name is available, and truncates long names with the full name in a title attribute.
- **Home page** (`routes/_app/index.tsx`): a card per module with its `nav` pages.
- **Command palette** (`shell/command-palette.tsx`): pages match on `title` and `keywords`. Records come from each module's `search`.
- **Layout** (`shell/app-shell.tsx`): `fullWidth` and `fill` on the current page change the content wrapper.

## Module search

`search` in the manifest is a `ModuleSearch`: a list of `scopes` (one per record type, each with a label, an icon, and a `list(q)` link to its list page filtered to the query) and `search(q, scopeId?)`, which returns groups of hits. The palette merges every module's results and offers a scope picker. Build links with `linkOptions` so the router checks them.

Copy `modules/crm/search.ts`: a small `readMany` per record type with a search filter from `modules/crm/data.ts`, mapped to `SearchHit`s.

## Copy

All user-facing text for a module lives in `modules/<id>/<id>.copy.ts` (`crmCopy` in `modules/crm/crm.copy.ts`). Shell and shared text is in `lib/app.copy.ts`, shared settings text in `settings/settings.copy.ts`, and module settings text in `modules/<id>/settings/settings.copy.ts`. The app module entry uses the copy file. The JSON manifest label and description describe choices during app creation. The comment at the top of `crm.copy.ts` names the CRM's record types (deals, activities, affiliations); a new module should state its own.

## Optional connector UI

To add UI from a connector without importing it into CRM:

1. Create `connectors/<id>/frontend/crm/feature.tsx`, using Portal or Stripe as an example. Keep queries, copy, display helpers, and tests in that feature folder.
2. Add `x-monoerp.contributes.crm` to the connector's `connector.json` with the feature's `collections`, and `requires` for other connectors it needs.
3. Export the feature's contributions from `feature.tsx`. Import contribution types from the target module's `@/modules/<module>/slots` (`@/modules/crm/slots` for CRM), plus core helpers and generated SDK types. This is the only module import allowed from connector frontend code; other module internals stay private.
4. Run `pnpm install`, configure the source with `pnpm setup:all`, regenerate the SDK with `pnpm generate`, and run `pnpm verify` plus browser tests.

A feature is on when its module is installed and its connector and every connector in its `requires` are installed and selected. Otherwise it is off, and `pnpm app:doctor` says why. Features show in connector ID order.

| Export from `feature.tsx` | Type / purpose                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default export            | `OrganizationPanelContribution`: ID, title, and component accepting `organization`; optional history query, editable `detailField`, and `prefetch` |
| `organizationList`        | `OrganizationListContribution`: list filters and columns receiving `organization` and visible `organizations`                                      |
| `contactPanel`            | `ContactPanelContribution`: contact tab, summary, history, and optional prefetch                                                                   |
| `dealSummary`             | `DealSummaryContribution`: labelled detail property and optional prefetch                                                                          |

Build and test configs define `__MODULE_FEATURE_PATHS__`, a map of module IDs to selected connector paths. Each module reads only its own entry.

CRM owns its contribution types and registry in `modules/crm/slots.ts`; `lib/modules/features.ts` selects the configured connector entries. Portal supplies all four contributions; Stripe supplies Billing as an organization panel and requires Portal. Removing Portal while Stripe is installed turns Billing off; removing Stripe hides Billing. CRM retains its stored Portal account link so restoring the connector can reconnect records. Follow the shared removal steps when retiring either source.

## How app:doctor works

`pnpm app:doctor` reads every part folder and prints what it found for each one, for example `portal (connector): compose, 1 schema file, 2 setup steps, migrate, provision, crm feature on`. A feature that cannot run says why: `crm feature off: needs portal`. A broken convention (a folder without its manifest, a missing `module.ts` or setup script, a `contributes` entry without its `feature.tsx`, an unknown or circular `requires`, overlapping `alsoOwns`, a `packageEntries` value that differs from the file) fails with a message naming what to add or fix.

`pnpm app:remove <id>` runs the same checks, then deletes the folder and `alsoOwns` and removes `packageEntries` from their JSON or YAML files, keeping their formatting and refusing a file that changed meanwhile. The implementation is `tools/manifest-schema.mjs`, `infra/manifests.mjs`, and `tools/app.mjs`.

The import-boundary tests also reject imports between modules or from a module into connector code. Shared registries are the documented entry points. Feature-aware typecheck creates a temporary check config extending `apps/web/tsconfig.json`; lint and unit/browser tests exclude inactive features. Frontend discovery exposes only selected feature paths, never source credentials.

## Deploy targets

`deploy/<id>/deploy.json` declares a hosting target. A second target belongs in a sibling folder. The app works with none installed.

Targets use the envelope only. Root files they need (a workflow, a package patch) are listed in `alsoOwns`, and root package or workspace entries in `packageEntries`. Remove a target with `pnpm app:remove <id>`, then run `pnpm install` and `pnpm verify`.

A target's `lint/config.ts` exports a Vite+ lint fragment. Plugin names share one namespace across installed targets and core. `tools/lint.ts` combines installed targets' fragments with the core strict rules in `tools/oxlint`. Strict lint and `@oxlint/plugins` are always installed. Lint implementation code and connector extensions follow the base rules.

Schema files inherit their source from their owner: modules use `app.config.json`'s `appSource`, and connectors use their manifest's source API name. Optional relation targets without a `source` use the app database.
