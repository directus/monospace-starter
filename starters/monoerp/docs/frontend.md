# Frontend conventions

How the app's screens are built, so new ones match. Each section points at one good file to copy. The app is in `apps/web/src`. Paths below start there.

## Reading data

Screens call Monospace from the browser with the generated SDK (`lib/monospace.ts`) and TanStack Query. Each module keeps its reads in one file: `modules/crm/data.ts`.

- A fetcher asks for exactly the fields and relations the screen shows (`fields`, `include`), and the row type comes from its return type (`OrganizationRow = Awaited<ReturnType<typeof fetchOrganizations>>[number]`). Don't write row types by hand.
- Query options wrap each fetcher (`organizationsPagesQuery`, `organizationDetailQuery`). Query keys start with the collection name (`['organizations', ...]`); mutations rely on that to refresh.
- Route loaders prime the cache with `queryClient.ensureQueryData` (or `ensureInfiniteQueryData`), and the component reads the same options with `useQuery`. A loader whose query can fail for reasons the user can fix on the page prefetches instead (`prefetchInfiniteQuery` in `routes/_app/crm/organizations.tsx`, where a portal filter can fail), so the error shows in the page rather than replacing it.
- Never include portal (MySQL) data in a CRM read: if MySQL is down, the whole request fails. Read it in its own query (`portalAccountQuery`, `portalSummaryQuery`, `portalUserQuery` in `connectors/portal/frontend/crm/data.ts`) and show "Portal unavailable" when it errors, or "isn't set up" when the source isn't connected (`isMissingFromWorkspace`). See `docs/architecture.md`.
- Never include `owner`, `createdBy`, or `updatedBy`: Monospace won't cache any query that includes a system user. Read the ID column (`ownerUserId`) and let `withOwners` / `withCreators` in `data.ts` fill in the user.
- User pickers use `lookupUsers` and `resolveUsers` from `lib/user-options.ts`. User avatars and labels live in `components/users.tsx`, and `InlineOwner` lives in `components/inline/inline-owner.tsx`. These are shared across modules.

## List pages

Copy `routes/_app/crm/organizations.tsx`. A list page's route file defines everything specific to it:

- **Columns:** a `DataTableColumn<Row>[]` array. Each column sets its header from copy, a size, and a `cell`. Right-aligned numbers use `meta.cellClassName`.
- **Filters:** a `ListFilterField[]` array. Plain fields map straight to Monospace filters. `relationField` and `dateField` build the common kinds. A field on another record (here, the portal plan) sets `toClause` to write the nested filter. `filtersToClause` in `lib/filters.tsx` turns the filter state into a Monospace filter.
- **Search params:** `validateSearch: listSearchSchema` (`lib/list-search.ts`) gives every list `q`, `sort`, `filters`, and `display`. All list state lives in the URL, so it survives reloads and can be shared. Update it with `navigate({ search: (previous) => ({ ...previous, ... }) })`.
- **Paging:** lists load in pages with `useInfiniteQuery`. `DataTable` loads the next page as you scroll (`hasMore`, `onLoadMore`).

The page is put together from shared components in `components/`:

| Component                                    | Does                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ListWorkspace`                              | Page frame: title and controls on top, the table filling the rest                           |
| `ListFilters`, `FilterTrigger`, `FilterWell` | Filter state, the Filter button, and the row of active filter chips                         |
| `ListToolbar`                                | Search box, actions, and the bulk bar when rows are selected                                |
| `useDataTable` + `DataTable`                 | Sorting, selection, column order and widths (saved per table in localStorage), virtual rows |
| `DisplayMenu`                                | Sort and column visibility, with a reset                                                    |
| `ListBulkActions`                            | Bulk edit and delete for the selected rows                                                  |

A list with a board view as well (`routes/_app/crm/deals.tsx`) switches on `search.display`.

## Detail pages

Copy `routes/_app/crm/organizations_.$organizationId.tsx`. The route parses its id with `uuidParam` (`lib/uuid.ts`), and the loader turns `MonospaceNotFoundError` into `notFound()`. The page is a header with the record's name and actions, a details card of inline fields, and tabs for related records.

## Forms

Create and full-edit forms use TanStack Form through `useAppForm` (`components/form/app-form.tsx`), with field components from `components/form/fields.tsx`. Copy `modules/crm/components/organization-form.tsx`.

- **Containers:** `FormDrawer` (`components/form/form-drawer.tsx`) slides in from the right, or up from the bottom on phones. `FormDialog` is for short forms.
- **Validation:** shared Zod validators in `components/form/validators.ts` (`requiredText`, `optionalEmail`, `optionalDomain`, and so on), with messages from copy.
- **Relations:** `RelationField` and `relation-combobox.tsx` search and pick related records. They take a `search` function from the module's `data.ts` (`lookupOrganizations`). Relation filters also take a `resolve` (ids to labels, `resolveOrganizations`).
- **Before sending:** mutations parse input with the generated Zod schemas (`generated/monospace/schemas.ts`), so bad data fails in the browser with a clear error.

## Inline editing

Detail pages edit fields in place with `components/inline/inline-field.tsx`. Each field saves on its own (blur, Enter, or pick) and shows its error under the value. Text fields take the same Zod validators as the forms. Use `PropertyList` for the details card.

## Mutations

Every write is a hook in the module's `mutations.ts` (`modules/crm/mutations.ts`). The pattern:

- `mutationFn` parses the input with the generated schema and calls the SDK, asking only for `id` back.
- `onSuccess` shows a toast from copy (`appCopy.toast.created`, `saved`, `deleted`) and invalidates the related query groups. A record shows up inside other records' queries, so invalidate every group that could include it.
- Hooks that fire on every keystroke or inline save take `{ notify: false }` to skip the toast.

## Permissions

Monospace enforces access on every request. The app only hides or disables controls, using the user's policies (`lib/permissions.ts`).

- On record pages and lists, `useCollectionAccess('organizations')` gives `create`, `delete`, and `canUpdate(field)` (field API names). It allows everything while the rules load or if they can't be read.
- `<Property readOnly={!access.canUpdate('industry')}>` turns the inline field inside it into plain text. For a field outside a `Property` (a page title), wrap it in `<InlineReadOnly value={...}>`.
- Leave out `onDelete` on `RecordMenu`, `DealActions`, and `ListBulkActions` to hide Delete, and don't render Add buttons the user can't use. Copy `routes/_app/crm/organizations_.$organizationId.tsx`.
- `modules/crm/settings/pipeline-stages.tsx` uses `collectionPermissionsQuery` directly, for finer control.

## Errors, loading, toasts

- Loading and failed queries: `DataLoading` and `DataError` (`components/data-state.tsx`).
- Turn any caught error into a sentence with `errorMessage` (`lib/errors.ts`). It knows permission errors, conflicts, and duplicates.
- Toasts are Sonner (`toast` from `sonner`). The `Toaster` is mounted once in `shell/app-shell.tsx`.

## Dates and numbers

- Showing values: `formatDate`, `formatDateTime`, `formatMoney`, and `formatRelative` in `lib/format.ts`. `RelativeTime` (`components/relative-time.tsx`) shows "3 days ago" with the exact time in a tooltip.
- Date inputs and defaults ("later today", "next week"): `lib/dates.ts`.
- Portal (MySQL) times are UTC.

## Copy

Put user-facing text in copy files, not in components. Shell and shared text is in `lib/app.copy.ts`, module text in `modules/<id>/<id>.copy.ts`, and module settings text in `modules/<id>/settings/settings.copy.ts`. Shared settings text is in `settings/settings.copy.ts`. Functions work for text with values in it (`appCopy.form.add(noun)`).

## Components

- `components/ui/` is shadcn/ui on Base UI (style `base-nova`, set in `apps/web/components.json`). Add a component with the shadcn CLI from `apps/web`, then adjust it here. Base UI composes with a `render` prop rather than Radix's `asChild`.
- `components/reui/` is ours: ported from ReUI (MIT, `components/reui/LICENSE`; what changed is in `UPSTREAM.md`), trimmed to what monoERP uses, and linted like the rest of the app. It holds the data grid, the filter builder, and the cascader. `DataTable` and `ListFilters` wrap them; use the wrappers. Each filter operator names the Monospace operator it runs as (`clause` in `filters/filters-operators.tsx`), so a new operator goes there.
- `components/` itself holds the app's shared components (lists, forms, inline fields, page header).
- Module-specific components live in `modules/<id>/components/`.

## Styling and icons

- Tailwind CSS v4, configured in `styles.css`. Merge classes with `cn` from `lib/utils.ts`. The formatter sorts class names.
- Icons are Lucide. A module names its record icons once (`modules/crm/icons.ts`) and uses those names everywhere, so an organization always has the same icon.

## Settings pages

Settings routes are `routes/_app/settings.<area>.<page>.tsx`, with module-specific components, copy, and tests in `modules/<id>/settings/` (`modules/crm/settings/pipeline-stages.tsx`). Shared settings, including the account page, stay in `settings/`. The settings layout is in `routes/_app/settings.tsx`; its module groups and links come from each manifest's `settings` field. `/settings` opens the first module settings page, or the account profile if no module provides settings. Give each settings route `parent: '/settings'` and some `keywords` so the palette finds it.

## Phones

Below 768px `useIsMobile` (`hooks/use-mobile.ts`) is true, and Tailwind's `max-md:` handles most layout. Explicit phone handling:

- `DataTable` renders a `mobileRow` per record instead of the grid. Each list page defines one with `DataTableMobileRow`.
- `FormDrawer` and `FormDialog` open as bottom sheets with the actions pinned above the keyboard.
- The sidebar becomes a sheet and closes when you pick a page. Breadcrumbs shrink to home and the current page.
- Toasts move to the bottom. Inline fields get taller rows for touch.
