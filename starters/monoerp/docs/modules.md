# Modules

monoERP is built so that more modules can sit next to the CRM. A module is a set of pages, a copy file, a JSON piece manifest, and a TypeScript UI entry. The shell (sidebar, breadcrumbs, home page, command palette) reads the UI entries and route metadata, so a new module shows up everywhere without touching shell code.

## Piece manifests

Each installed piece has one plain JSON manifest: `modules/<id>/piece.json`, `connectors/<id>/piece.json`, or `core/piece.json`. Node readers share `infra/pieces.mjs`, without importing React or needing a TypeScript loader. `tools/piece-schema.mjs` defines the Zod schema used by `pnpm pieces:check` and `pnpm pieces:remove`.

Every manifest declares `kind`, `id`, picker `label`/`description`, `ownedPaths`, `requires`, and `optional`. Paths are literal, repository-relative files or folders, not globs. A folder owns its contents. The manifest itself must be owned. Core lists the shared app/infra paths and routes and is always installed.

Module manifests also declare:

- `app` and `infra`: the existing module folders.
- `order`, `collections`, `schemas`: generation order, SDK collections, and the subset needing write schemas.
- `settings`: owned settings route files. Typed links, titles, and icons stay in the TypeScript UI entry.
- `schemaFiles`, `auditTables`, and `setup.beforeSchema`/`setup.afterSchema`: backend schema files, user audit relations, and ordered setup steps. Step scripts are relative to the piece's `monospace/setup/` folder; `requires` makes a step conditional on selected connectors.
- Optional `compose` and `composeProfiles`: Compose files and named overlays, with repository-relative paths.

`requires` prevents removal of dependencies. CRM lists Portal and Stripe as optional because their UI and collection requirements live in conditional connector features. Portal stays selected by default as the MySQL demo. Stripe's CRM feature also requires selected Portal; without Portal, Billing stays inactive. Unset `OPTIONAL_SOURCES` selects installed modules' required and optional connectors; an explicit value still replaces setup selection. Conditional feature dependencies do not make their host module or sources mandatory for the connector itself.

`pnpm pieces:check` validates every manifest, checks owned and referenced paths, rejects overlapping ownership, and requires exactly one owner for every source file under `apps/web/src/routes`, `apps/web/src/modules`, `infra/modules`, and `connectors`. In a Git checkout it includes untracked source files and excludes Git-ignored files. Without Git, it walks those trees while skipping dependency/build folders. Missing owned dotfolders are allowed; referenced manifests, entry files, schemas, and scripts remain required. Removal validates manifest dependencies, ownership boundaries, and required referenced paths before any deletion. The unowned-file scan belongs to `pnpm pieces:check`. Symlink paths and ancestors are refused.

## The UI contract

A module UI entry is a `ModuleManifest` (`apps/web/src/modules/types.ts`):

| Field         | What it does                                                          |
| ------------- | --------------------------------------------------------------------- |
| `id`          | A `ModuleId`. Pages point at it with `page.module`                    |
| `order`       | Sidebar, home, and settings order (lower first)                       |
| `label`       | The sidebar group heading, the module's breadcrumb, its home card     |
| `description` | The line under the module's card on the home page                     |
| `icon`        | The home card icon                                                    |
| `basePath`    | The module's landing page (`/crm`). Breadcrumbs link to it            |
| `search`      | Optional. Scopes and a search function for the command palette        |
| `settings`    | Optional. Group title and ordered pages (`title`, typed `to`, `icon`) |

`apps/web/src/modules/index.ts` discovers default exports from `./*/module.ts` with an eager Vite glob, sorted by `order`. It exports `modules` and `moduleById`. Each UI entry adds its own key to `ModuleRegistry` through TypeScript declaration merging; `ModuleId` is `keyof ModuleRegistry`. Deleting the module folder removes both its runtime registration and its ID type. The CRM's UI entry is `apps/web/src/modules/crm/module.ts`.

The UI entry reads `order` from its piece manifest. Its label and description are app copy; the JSON label and description describe the piece in a future CLI picker. CRM owns only its PostgreSQL collections. Portal's optional feature owns its MySQL collections; Stripe's optional feature owns its Stripe collections.

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

All user-facing text for a module lives in `modules/<id>/<id>.copy.ts` (`crmCopy` in `modules/crm/crm.copy.ts`). Shell and shared text is in `lib/app.copy.ts`, shared settings text in `settings/settings.copy.ts`, and module settings text in `modules/<id>/settings/settings.copy.ts`. The manifest's label and description come from the copy file too. The comment at the top of `crm.copy.ts` sets the CRM's naming ("deals", not "opportunities"); a new module should state its own.

## Add a module

Say the new module is `inventory`. Its four locations have different jobs:

| Path                                  | Purpose                                         |
| ------------------------------------- | ----------------------------------------------- |
| `modules/inventory/piece.json`        | Ownership, dependencies, collections, and setup |
| `apps/web/src/modules/inventory/`     | UI entry, copy, reads, and mutations            |
| `infra/modules/inventory/`            | Database SQL and Monospace setup                |
| `apps/web/src/routes/_app/inventory/` | Pages discovered by the router                  |

1. **Data first.** Put module SQL under `infra/modules/inventory/postgres/{init,migrations}/`, Monospace settings under `monospace/schema/`, and setup steps under `monospace/setup/`. Create `modules/inventory/piece.json` using an existing module manifest, declaring owned folders/routes, required and optional connectors, schema files, audit tables, and ordered steps. Connector source configs and schema settings belong in `connectors/<id>/`; see [connector pieces](../connectors/README.md). A setup step can declare `requires: ['portal']` to skip when that connector is absent or disabled. Setup and migrations discover these folders without registration. The module's tables live in a database Monospace can reach, either a new source or new tables in an existing one. See [`data-model.md`](data-model.md) for schema changes and [`monospace.md`](monospace.md) for `pnpm setup:all`.
2. **Generated client.** Set `order`, `collections`, and `schemas` in `modules/inventory/piece.json`. Run `pnpm generate`. Only present modules contribute collections.
3. **Copy.** Create `apps/web/src/modules/inventory/inventory.copy.ts` with at least `module: { label, description }` and titles for each page.
4. **UI entry.** Create `apps/web/src/modules/inventory/module.ts` with a default-exported `ModuleManifest`, `id: 'inventory'`, `order` imported from the piece, and `basePath: '/inventory'`. Augment `ModuleRegistry` in `@/modules/types` with `inventory: true` in this UI entry. The glob discovers it automatically, with no core list change. Leave `search` out until there's something to search.
5. **Pages.** Add routes under `apps/web/src/routes/_app/inventory/`:
   - `index.tsx` for `/inventory`, with `staticData.page` set to `module: 'inventory'` and a `nav` number.
   - List pages like `items.tsx`, with `nav`. Detail pages like `items_.$itemId.tsx` (the trailing `_` keeps it out of the list page's layout), with `parent: '/inventory/items'` and no `nav`.
   - `routeTree.gen.ts` updates on its own when the dev server or `pnpm generate:routes` runs.
6. **Data and mutations.** Put query options and fetchers in `modules/inventory/data.ts` and mutation hooks in `modules/inventory/mutations.ts`, following the CRM's files (see `docs/frontend.md`).
7. **Search (optional).** Add `modules/inventory/search.ts` and set `search` in the manifest.
8. **Settings (optional).** Settings routes are `routes/_app/settings.<area>.<page>.tsx` with components, copy, and tests in `apps/web/src/modules/<id>/settings/`. Add `settings: { title, pages: [{ title, to, icon }] }` to the manifest. Settings nav uses those groups; `/settings` opens the first module settings page in manifest order, falling back to `/settings/account` when none exist.
9. **Check.** `pnpm check && pnpm typecheck && pnpm test`, then open the app: the module should have a sidebar group, a home card, breadcrumbs, and palette entries.

## Removing a module

Preview the exact deletion set, then remove it:

```sh
pnpm pieces:remove crm --dry-run
pnpm pieces:remove crm
```

Then follow the [shared removal steps](../connectors/README.md#remove-a-piece).

The command deletes only `ownedPaths`, including the piece manifest, module folders, settings routes, and public routes. It refuses core and any dependency required by an installed piece. Connectors remain independent pieces: removing CRM leaves Portal and Stripe installed; remove it separately if unused. `pnpm pieces:remove stripe` removes its whole folder and optional UI without changing CRM. Removing Portal leaves CRM working and hides Portal UI and the dependent Billing feature. No package, environment, database, or generated-file edits happen during removal; the printed commands regenerate derived files. Run `pnpm install` after workspace packages change.

Routes stay under `src/routes`, where TanStack already discovers them. The manifest is the ownership list for routes outside a module folder. Setup and migrations still use the existing infra folders. After syncing Compose, `docker compose up -d --remove-orphans` reconciles services; retiring a source in Monospace and its stored data is separate from removing source files.

## Optional connector UI

A connector can own a frontend feature at `connectors/<connector>/frontend/<module>/`. Its connector's `piece.json` declares a `frontend` entry with target `module`, feature `path`, `slot` (currently `organization-panel` for CRM), `requires` (conditional connector IDs), `order`, `collections`, and `schemas`. `apps/web/scripts/module-collections.ts` reads JSON through `infra/pieces.mjs`, loads the root environment file directly, and selects a feature only when its module folder exists, its connector is selected by backend setup, and all required connectors are present and selected. Collections keep their configured order; features do not contribute write schemas unless declared.

The first slot is an organization panel. `feature.tsx` default-exports an `OrganizationPanelContribution` from `@/modules/types`: a stable `id`, `title`, and React `component` accepting `{ portalAccountId: string | null }`. The component owns its query. `modules/organization-panels.ts` imports only `frontend/crm/feature.tsx` entries selected for target `crm` and slot `organization-panel`. An active entry missing from disk or the Vite glob fails instead of disappearing. Other target modules and slots never enter the CRM panel array. The organization route renders each panel's tab/content behind a section error boundary. The same CRM feature entry can export three additional screen slots: `organizationList` (`OrganizationListContribution`, filters and column components), `contactPanel` (`ContactPanelContribution`, tab, summary and history query), and `dealSummary` (`DealSummaryContribution`, a labelled property). The registry selects these exports from the same active CRM entries. Portal uses all three; Stripe uses only the organization panel. These are explicit screen contracts, not arbitrary extension points. Organization panels may also contribute read-only history entries and receive an add-contact callback. Each component/query stays in its connector; CRM only supplies record fields and renders the slots. There is no hand-kept connector registration or source query in CRM.

Feature code imports only its own frontend files, core helpers, and generated SDK types. The boundary test checks those imports too. Shared display pieces live in `components/source-panel.tsx`; Stripe's billing query, helpers, copy, and tests live entirely under `connectors/stripe/frontend/crm/`. The frontend workspace package owns its dependencies and an editor tsconfig extending the app's config. Keep shared dependency versions aligned with the app.

`pnpm typecheck` generates a temporary `apps/web/tsconfig.check.json` containing core plus active features, runs TypeScript, then removes it. Lint and unit/browser test discovery also skip inactive features. Vite receives only selected paths as public build metadata, never connector source configuration or secrets. Tailwind scans connector frontend folders too.

Deleting `connectors/stripe/` removes the Billing tab, its query/types/tests, and its collection requirements. Follow the [shared removal steps](../connectors/README.md#remove-a-piece); CRM and Portal no longer require Stripe types. Restoring the folder and reinstalling workspace packages restores the feature. Deleting `connectors/portal/` removes its panels, list filters/columns, deal summary, history queries, tests, and collection requirements. It also makes the installed Stripe CRM feature inactive. The CRM keeps its stored `portalAccountId` field, so restoring Portal can reconnect existing records.
