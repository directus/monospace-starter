# Modules

Add business areas next to CRM without editing the shell. Each module has four folders and uses the shared `monoerp` workspace and PostgreSQL database.

## Add a module

Use CRM as the working example for a new `inventory` module:

| Copy from                      | New location                         | Contains                                   |
| ------------------------------ | ------------------------------------ | ------------------------------------------ |
| `modules/crm`                  | `modules/inventory`                  | Module manifest                            |
| `apps/web/src/modules/crm`     | `apps/web/src/modules/inventory`     | UI entry, copy, reads, writes, and tests   |
| `infra/modules/crm`            | `infra/modules/inventory`            | SQL, demo data, schema settings, and setup |
| `apps/web/src/routes/_app/crm` | `apps/web/src/routes/_app/inventory` | Pages                                      |

1. Replace the copied CRM IDs, imports, tables, demo records, queries, and tests with your module's data. Put SQL in `infra/modules/inventory/postgres/{init,migrations}/` and schema settings in `monospace/schema/`. Use the existing shared database; see [schema changes](data-model.md#changing-the-schema).
2. Edit `modules/inventory/module.json`: change the ID, owned paths, `app`, `infra`, collections, write schemas, audit columns, and setup scripts. Remove optional connectors you do not use, and clear settings entries unless you copy those route files too. Include every route owned by your module, including settings routes outside its route folder.
3. Rename `crm.copy.ts` to `inventory.copy.ts` and edit it with `module.ts`. Export a `ModuleManifest`, use `id: 'inventory'` and `basePath: '/inventory'`, and add `inventory: true` to `ModuleRegistry` through declaration merging. The registry discovers `modules/*/module.ts` automatically.
4. Update each page's `createFileRoute` path and links, then set `staticData.page`: set `module`, `title`, and `icon`; add `nav` for sidebar pages and `parent` for detail pages. Use `index.tsx` for `/inventory` and `items_.$itemId.tsx` for a detail page outside the list layout. Follow [frontend conventions](frontend.md).
5. Add search or settings only if needed. Copy `crm/search.ts` for search; settings routes use `routes/_app/settings.inventory.<page>.tsx` and the manifest's `settings` entries.
6. Run `pnpm app:doctor`, `pnpm db:migrate`, `pnpm setup:all`, `pnpm generate:routes`, and `pnpm generate`.
7. Run `pnpm verify` (plus browser tests for components). Open the module and check its sidebar group, home card, breadcrumbs, and command-palette entries.

## Remove a module

Preview with `pnpm app:remove crm --dry-run`, then run `pnpm app:remove crm` and the [shared removal steps](../connectors/README.md#remove-a-module-or-connector). Connectors remain installed until removed separately.

## Starter, module, and connector manifests

Each file has a required `format` marker, such as `urn:monospace:manifest:module:1`.
The shared envelope contains `kind`, `id`, `label`, `description`, `ownedPaths`, `requires`
and `packageEntries`. `requires` defaults to an empty list. Conditional requirements use
`requiresWhenInstalled`, for example `{ "crm": ["portal"] }` on Stripe.

monoERP runtime settings live under `x-monoerp`: module app/infra paths, collections, setup,
connector source settings and frontend features. Optional connector defaults are there too.
Setup and app scripts validate these runtime settings alongside the shared envelope.

`starter.json` also declares `sourceRoots`, literal `ignorePaths`, and `nextSteps.create` /
`nextSteps.remove`. Next steps name package scripts (`{ "script": "setup:all" }`) or explicit
command arguments (`{ "command": ["cp", "-n", ".env.example", ".env"] }`). Steps with
`"when": "choices-changed"` run only after modules or connectors are left out. These are printed
instructions, not code that the CLI evaluates. Package scripts use the detected package manager.

The starter declares shared ownership in root `starter.json`. Each module uses `modules/<id>/module.json`; each connector uses `connectors/<id>/connector.json`. The starter owns the shared shell and services and cannot be removed.

| Field                                | Contract                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `kind`, `id`, `label`, `description` | Kind (`starter`, `module`, `connector`, or `addon`), stable ID, label, and description |
| `ownedPaths`                         | Literal repository-relative paths; a folder owns its contents, including its manifest  |
| `requires`                           | Required dependencies block removal                                                    |
| `packageEntries`                     | JSON package or YAML workspace file, section, and entry names deleted with the owner   |

### `x-monoerp` runtime settings

| Field                                     | Contract                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `optional`                                | Connector IDs selected by default                                                                          |
| `app`, `infra`, `settings`                | Module UI/infra folders and settings route files                                                           |
| `order`, `collections`, `schemas`         | Module order, required API collections, and collections needing write schemas                              |
| `schemaFiles`, `auditTables`              | Schema settings files and SQL columns linked to Monospace users                                            |
| `setup.beforeSchema`, `setup.afterSchema` | Ordered steps; each has a title and script relative to the module or connector's `monospace/setup/` folder |
| Setup step `requires`                     | Skip unless each required module is installed or connector is selected                                     |
| `compose`, `composeProfiles`              | Optional Compose file and profile overlays, relative to the repo root                                      |

Leave `OPTIONAL_SOURCES` unset to use installed modules' connector declarations. Set it to a comma-separated list to override them, or empty to select none. A connector folder must exist to be selected. See [connector setup](../connectors/README.md).

## The UI contract

A module UI entry is a `ModuleManifest` (`apps/web/src/modules/types.ts`):

| Field         | What it does                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| `id`          | A `ModuleId`. Pages point at it with `page.module`                           |
| `order`       | Sidebar, home, and settings order (lower first)                              |
| `label`       | The sidebar group heading, the module's breadcrumb, its home card            |
| `description` | The line under the module's card on the home page                            |
| `icon`        | The home card icon                                                           |
| `basePath`    | The module's landing page (`/crm`). Breadcrumbs link to it                   |
| `search`      | Optional. Scopes and a search function for the command palette               |
| `settings`    | Optional group title and page paths derived from the JSON settings-file list |

`apps/web/src/modules/index.ts` discovers default exports from `./*/module.ts` with an eager Vite glob, sorted by `order`. It exports `modules` and `moduleById`. Each UI entry adds its own key to `ModuleRegistry` through TypeScript declaration merging; `ModuleId` is `keyof ModuleRegistry`. Deleting the module folder removes both its runtime registration and its ID type. The CRM's UI entry is `apps/web/src/modules/crm/module.ts`.

The UI entry reads `order` from its module manifest. The UI derives settings route paths from the JSON file list with `settingsPaths`; route `staticData.page` owns each title and icon. Its label and description are app copy; the JSON label and description describe the installable module. CRM owns only its PostgreSQL collections. Portal's optional feature owns its MySQL collections; Stripe's optional feature owns its Stripe collections.

## Page metadata

Pages describe themselves in the route's `staticData.page` (`PageMeta` in `modules/types.ts`). `usePages()` (`modules/pages.ts`) collects every route that has one and no URL params, sorted by `nav`.

| Field       | Used by                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| `title`     | Sidebar, breadcrumbs, command palette                                            |
| `icon`      | Sidebar and command palette                                                      |
| `module`    | Which sidebar group and home card the page belongs to, and the module breadcrumb |
| `nav`       | Present means the page is in the sidebar. The number sets the order              |
| `parent`    | For detail pages: the list page shown as the middle breadcrumb                   |
| `keywords`  | Extra words the command palette matches on                                       |
| `fullWidth` | Drops the content max width (wide tables, boards)                                |
| `fill`      | Pins the content to the viewport height so the page's own scroller fills it      |

Examples: a list page is `routes/_app/crm/organizations.tsx` (`nav`, `fullWidth`, `fill`, `keywords`). A detail page is `routes/_app/crm/organizations_.$organizationId.tsx` (`module` and `parent`, no `nav`).

Where it's read:

- **Sidebar** (`shell/app-sidebar.tsx`): one group per module, listing its pages that have `nav`. Clicking a group's label collapses it; closed groups are remembered in localStorage (`shell/use-nav-groups.ts`), going to a page in a closed group opens it, and the icon-only sidebar always shows every page.
- **Breadcrumbs** (`AppHeader` in `shell/app-shell.tsx`): home, then the module (linking to `basePath`), then `parent` if set, then the page. On phones the middle crumbs hide.
- **Home page** (`routes/_app/index.tsx`): a card per module with its `nav` pages.
- **Command palette** (`shell/command-palette.tsx`): pages match on `title` and `keywords`. Records come from each module's `search`.
- **Layout** (`shell/app-shell.tsx`): `fullWidth` and `fill` on the current page change the content wrapper.

## Module search

`search` in the manifest is a `ModuleSearch`: a list of `scopes` (one per record type, each with a label, an icon, and a `list(q)` link to its list page filtered to the query) and `search(q, scopeId?)`, which returns groups of hits. The palette merges every module's results and offers a scope picker. Build links with `linkOptions` so the router checks them.

Copy `apps/web/src/modules/crm/search.ts`: a small `readMany` per record type with a search filter from `modules/crm/data.ts`, mapped to `SearchHit`s.

## Copy

All user-facing text for a module lives in `modules/<id>/<id>.copy.ts` (`crmCopy` in `modules/crm/crm.copy.ts`). Shell and shared text is in `lib/app.copy.ts`, shared settings text in `settings/settings.copy.ts`, and module settings text in `modules/<id>/settings/settings.copy.ts`. The app module entry uses the copy file. The JSON manifest label and description describe choices during app creation. The comment at the top of `crm.copy.ts` sets the CRM's naming ("deals", not "deals"); a new module should state its own.

## Optional connector UI

To add UI from a connector without importing it into CRM:

1. Create `connectors/<id>/frontend/crm/feature.tsx`, using Portal or Stripe as an example. Keep queries, copy, display helpers, and tests in that feature folder.
2. Add a `frontend` entry to the connector's `connector.json`, using the contract below.
3. Export the feature's contributions from `feature.tsx`. Import contribution types from the target module's `@/modules/<module>/slots` (`@/modules/crm/slots` for CRM), plus core helpers and generated SDK types. This is the only module import allowed from connector frontend code; other module internals stay private.
4. Run `pnpm install`, configure the source with `pnpm setup:all`, regenerate the SDK with `pnpm generate`, and run `pnpm verify` plus browser tests.

| Feature manifest field   | Contract                                                     |
| ------------------------ | ------------------------------------------------------------ |
| `module`, `path`         | Target module and `connectors/<id>/frontend/<module>` folder |
| `slot`                   | `organization-panel` for the CRM feature entry               |
| `requires`               | Other selected connectors needed by this feature             |
| `order`                  | Display order                                                |
| `collections`, `schemas` | Required API collections and write schemas                   |

| Export from `feature.tsx` | Type / purpose                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Default export            | `OrganizationPanelContribution`: ID, title, and component accepting `organization`; optional history query and editable `detailField` |
| `organizationList`        | `OrganizationListContribution`: list filters and columns receiving `organization` and visible `organizations`                         |
| `contactPanel`            | `ContactPanelContribution`: contact tab, summary, and history                                                                         |
| `dealSummary`             | `DealSummaryContribution`: labelled detail property                                                                                   |

Build and test configs define `__MODULE_FEATURE_PATHS__`, a map of module IDs to selected connector paths. Each module reads only its own entry.

CRM owns its contribution types and registry in `modules/crm/slots.ts`; `modules/features.ts` selects the configured connector entries. Portal supplies all four contributions; Stripe supplies Billing as an organization panel and requires Portal. Removing Portal hides both features; removing Stripe hides Billing. CRM retains its stored Portal account link so restoring the connector can reconnect records. Follow the shared removal steps when retiring either source.

## How app:doctor works

Setup-step requirements may name dependencies declared in `requiresWhenInstalled`, even after that optional connector is removed. Those steps are skipped when their dependencies are absent; undeclared requirement names still fail validation.

`pnpm app:doctor` validates manifests, dependencies, referenced files, and exclusive ownership under `apps/web/src/routes`, `apps/web/src/modules`, `infra/modules`, and `connectors`. In Git it checks tracked and untracked source files while respecting ignores; without Git it walks source trees and skips dependencies/build output. Owned dotfolders may be absent, but referenced manifests, entry files, schemas, and scripts must exist. Ownership cannot overlap or traverse symlinks. Removal validates paths and dependencies before deleting anything. The implementation is in `tools/manifest-schema.mjs` and `tools/app.mjs`.

The import-boundary tests also reject imports between modules or from a module into connector code. Shared registries are the documented entry points. Feature-aware typecheck creates a temporary check config extending `apps/web/tsconfig.json`; lint and unit/browser tests exclude inactive features. Frontend discovery exposes only selected feature paths, never source credentials.

## Add-ons

`addons/<id>/addon.json` declares optional tooling using `urn:monospace:manifest:addon:1` and `kind: addon`. Add-ons use the shared ownership, dependency, and package-entry fields without `x-monoerp`. Remove them with `pnpm app:remove <id>` and follow the [shared removal steps](../connectors/README.md#remove-a-module-or-connector).
