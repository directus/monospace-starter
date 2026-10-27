# Frontend conventions

How the app's screens are built, so new ones match. Each section points at one good file to copy. The app is in `apps/web/src`. Paths below start there.

## Reading data

Screens call Monospace from the browser with the generated SDK (`lib/monospace.ts`) and TanStack Query. Each module keeps its reads in one file: `modules/crm/data.ts`.

- A fetcher asks for exactly the fields and relations the screen shows (`fields`, `include`), and the row type comes from its return type (`OrganizationRow = Awaited<ReturnType<typeof fetchOrganizations>>[number]`). Don't write row types by hand.
- Query options wrap each fetcher (`organizationsPagesQuery`, `organizationDetailQuery`). Query keys start with the collection name (`['organizations', ...]`); mutations rely on that to refresh.
- Every screen loads the same way, below. Don't use `ensureQueryData`, `prefetchQuery`, `fetchQuery`, or their infinite versions: they're deprecated in the installed TanStack Query.
- Never include portal (MySQL) data in a CRM read: if MySQL is down, the whole request fails. Read it in its own query (`portalAccountQuery`, `portalSummaryQuery`, `portalUserQuery` in `connectors/portal/frontend/crm/data.ts`) and show "Portal unavailable" when it errors, or "isn't set up" when the source isn't connected (`isMissingFromWorkspace`). See `docs/architecture.md`.
- Never include `owner`, `createdBy`, or `updatedBy`: Monospace won't cache any query that includes a system user. Read the ID column (`ownerUserId`) and let `withUsers` in `lib/monospace-system.ts` (the caller names each output field) fill in the user. The app layout starts reading the member list (`loadMembers`) with the first page, so `withUsers` rarely makes a request of its own.
- User pickers use `lookupUsers` and `resolveUsers` from `lib/users.ts`. User avatars and labels live in `components/users.tsx`, and `InlineOwner` lives in `components/inline/inline-owner.tsx`. These are shared across modules.

### Loading a screen

The route's loader puts the data in the cache before the page renders; the page reads it from the cache with the same query options. Copy this:

```tsx
// modules/<id>/data.ts: one options factory per read
export function organizationDetailQuery(id: Uuid) {
  return queryOptions({
    queryKey: ['organizations', id],
    queryFn: () => fetchOrganizationDetail(id),
  })
}

// routes/...: the loader awaits only what the first paint needs
export const Route = createFileRoute('/_app/crm/organizations_/$organizationId')({
  loader: async ({ context: { queryClient }, params: { organizationId } }) => {
    const organization = await ensureOrNotFound(
      queryClient,
      organizationDetailQuery(organizationId),
    )

    // Panels and connector tabs: started now, never awaited, so they never hold the page.
    for (const panel of organizationPanels) panel.prefetch?.(queryClient, { organization })
    void queryClient.query(attachmentsQuery({ organizationId })).catch(noop)
  },
  component: OrganizationDetailPage,
})

function OrganizationDetailPage() {
  const { organizationId } = Route.useParams()
  const detail = useSuspenseQuery(organizationDetailQuery(organizationId)) // data is never undefined
}
```

- **Blocking reads** in a loader use `await queryClient.query({ ...options, staleTime: 'static' })` (`infiniteQuery` for pages). `'static'` returns cached data without waiting on a refetch, so going back to a page is instant; the page's own query refreshes stale data in the background. `ensureOrNotFound` (`lib/route-loaders.ts`) does the same and turns a missing record into `notFound()`.
- **Everything else** starts in the loader without `await`: `void queryClient.query(options).catch(noop)`. Panels, tabs, and connector data show their own loading state.
- **Same options, same params.** The page passes exactly what the loader used: `Route.useLoaderDeps()` for lists, `Route.useParams()` for records. Keep UI-only state (the deals `display` switch) out of the query params; `routes/_app/crm/deals.tsx` nests them as `{ display, params }`. `modules/crm/loader-keys.test.ts` checks this for each CRM list.
- **Pages read with `useSuspenseQuery`** when the loader awaited the data, so there's no loading branch to write. Secondary reads use `useQuery` and render `DataLoading` themselves.
- **A loader that can fail for reasons the user can fix on the page** catches its error (`.catch(noop)` in `routes/_app/crm/organizations.tsx`, where a portal filter can fail), so the page's query shows the error under its filters instead of replacing the page.
- **Connector panels** start their reads through the slot's `prefetch` (`modules/crm/slots.ts`), which record loaders call once the record is known.
- **Per-user reads** (session, permissions, members) start once in `routes/_app.tsx` `beforeLoad`. Permissions are one query per user (`userPoliciesQuery`); `useCollectionAccess` picks a collection out of it with `select`.
- Links preload on hover (`defaultPreload: 'intent'` in `router.tsx`), so most clicks find their data already loaded. While a loader runs, the current page stays and a thin bar under the header shows the click registered (`NavigationProgress` in `shell/app-shell.tsx`). Lists keep their old rows while a new search, filter, or sort loads, so don't give a list a `pendingComponent`.
- Nothing fetches in `useEffect`. A value that's needed later (the upload size cap) is a query too (`uploadLimitQuery`), read when it's needed.
- **Startup stays small.** The page head starts the session requests before the app's code loads (`earlySessionScript` in `lib/auth.ts`), and the refresh and user read run in parallel. Generated write schemas build on first use (`z.lazy` in `scripts/generate-zod-schemas.ts`). Heavy components below the fold load lazily with a placeholder of the same size: `components/notes-editor.tsx` wraps BlockNote, which only `components/notes-block-editor.tsx` may import (`notes-editor.test.ts` checks). Once the first page is up, the shell fetches the code for module pages in the background (`usePreloadModulePages`).

## List pages

Copy `routes/_app/crm/organizations.tsx`. A list page's route file defines everything specific to it:

- **Columns:** a `DataTableColumn<Row>[]` array. Each column sets its header from copy, a size, and a `cell`. Right-aligned numbers use `meta.cellClassName`.
- **Filters:** a `ListFilterField[]` array. Plain fields map straight to Monospace filters. `relationField` and `dateField` build the common kinds. A field on another record (here, the portal plan) sets `toClause` to write the nested filter. `filtersToClause` in `lib/filters.tsx` turns the filter state into a Monospace filter.
- **Search params:** `validateSearch: listSearchSchema` (`lib/list-search.ts`) gives every list `q`, `sort`, `filters`, and `display`. All list state lives in the URL, so it survives reloads and can be shared. Filters are a flat AND list (`{ rules: [...] }`). Pass one `onSearchChange` callback that merges the patch into previous search. `useListSearch` owns q/sort/filter/display changes; it omits empty filter queries from the URL. Activity uses this URL helper with its own bucket queries.
- **Paging:** `useListPage` (`hooks/use-list-page.ts`) shares the loader params with the query factory, flattens pages, clears selection when params change, and wires table sorting and paging. Pass `Route.useLoaderDeps()` so prefetching and rendering use identical params.

The page is put together from shared components in `components/`:

| Component                   | Does                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `ListWorkspace`             | Page frame: title and controls on top, the table filling the rest                           |
| `ListControls`              | Search, filter cascader/chips, display menu, and list-specific actions                      |
| `ListToolbar`               | Search box, actions, and the bulk bar when rows are selected                                |
| `useListPage` + `ListTable` | Sorting, selection, column order and widths (saved per table in localStorage), virtual rows |
| `DisplayMenu`               | Sort and column visibility, with a reset                                                    |
| `ListBulkActions`           | Bulk edit and delete for the selected rows                                                  |

`ListAddButton` keeps create actions consistent on desktop and phones. `ListBulkActions` accepts field permissions, plus `statusBulkField` and `ownerBulkField`.

A list with a board view as well (`routes/_app/crm/deals.tsx`) switches on `search.display`.

## Detail pages

Copy `routes/_app/crm/organizations_.$organizationId.tsx`. The route parses its id with `uuidParam` (`lib/uuid.ts`), and `ensureOrNotFound` (`lib/route-loaders.ts`) turns missing records into `notFound()`. Its loader starts the panels' reads (see "Loading a screen"). Detail fetchers return a non-null ID. The page uses `RecordTitle`/`RecordName` inside `PageHeader`, `RecordDetails` around the details fields, and `RecordTabs` for activity, notes, files, and connector tabs. `AffiliationsPanel` owns the shared role edit/end/remove flow; `DealsPanel` owns the organization's deals list.

## Forms

Create and full-edit forms use TanStack Form through `useAppForm` (`components/form/app-form.tsx`), with field components from `components/form/fields.tsx`. Copy `modules/crm/components/organization-form.tsx`.

- **Submit errors:** wrap the write in `submitForm(formApi, async () => { ... })` inside `onSubmit`. It clears the last failure and puts a caught message in TanStack Form state. Render `<form.FormError />` under `form.AppForm`, in the drawer footer. Validation and retries share that error state.
- **Containers:** `FormDrawer` (`components/form/form-drawer.tsx`) slides in from the right, or up from the bottom on phones. `FormDialog` is for short forms.
- **Validation:** shared Zod validators in `components/form/validators.ts` (`requiredText`, `requiredEmail`, `optionalDomain`, and so on), with messages from copy.
- **Relations:** `RelationField` and `relation-combobox.tsx` search and pick related records. They take a `search` function from the module's `data.ts` (`lookupOrganizations`). Relation filters also take a `resolve` (ids to labels, `resolveOrganizations`).
- **Before sending:** mutations parse input with the generated Zod schemas (`generated/monospace/schemas.ts`), so bad data fails in the browser with a clear error.

## Inline editing

Detail pages edit fields in place with `components/inline/inline-field.tsx`. Each field saves on its own (blur, Enter, or pick): the editor closes at once and shows the new value while the write runs. If the write fails, the field goes back to the saved value and shows the error under it. Text fields take the same Zod validators as the forms. Use `PropertyList` for the details card. Pass notes-field access to `NotesEditor.readOnly` to keep editing consistent with other fields.

## Mutations

Every write is a hook in the module's `mutations.ts` (`modules/crm/mutations.ts`). Use the same entity names for functions, row types, SDK collections, and query keys (`dealsQuery`, `DealRow`, `useUpdateDeal`, `ActivityRecord`). The pattern:

- `mutationFn` parses the input with the generated schema and calls the SDK, asking only for `id` back.
- `onSuccess` shows a toast from copy (`appCopy.toast.created`, `saved`, `deleted`) and refreshes CRM record queries through `refreshCrm` (`modules/crm/refresh.ts`). A record shows up inside other records' queries, so invalidate every group that could include it.
- Edits that should feel instant (inline fields, stage moves, board drags) write the change into the cache first and refresh after, without holding the field in its saving state. Copy `useUpdateDeal`:

  ```ts
  onMutate: ({ id, data }) =>
    patchCached<DealDetail>(queryClient, { queryKey: dealDetailQuery(id).queryKey, exact: true },
      (detail) => ({ ...detail, ...data })),
  onError: (_error, _input, rollback) => rollback?.(),
  onSettled: () => void refreshCrm(queryClient),
  ```

  `patchCached` cancels refetches in flight and returns the rollback. Only patch what the cache can show: an id whose label comes from a relation (a deal's organization) only appears after the refetch, so `useUpdateDeal` returns the refresh from `onSettled` for those saves to stay pending until it lands. Creates, deletes, bulk edits, and activity completion still await the refresh, since their rows appear, leave, or move.

- `useCloseDeal` confirms the value and close date, updates the deal, and files an optional outcome note. The board and detail page share this workflow. These are separate requests; refreshing on failure shows a close that succeeded even when its note failed.
- Hooks that fire on every keystroke or inline save take `{ notify: false }` to skip the toast.

## Permissions

Monospace enforces access on every request. The app only hides or disables controls, using the user's policies (`lib/permissions.ts`).

- On record pages and lists, `useCollectionAccess('organizations')` gives `create`, `delete`, and `canUpdate(field)` (field API names). It allows everything while the rules load or if they can't be read.
- `<Property readOnly={!access.canUpdate('industry')}>` turns the inline field inside it into plain text. For a field outside a `Property` (a page title), wrap it in `<InlineReadOnly value={...}>`.
- Leave out `onDelete` on `RecordMenu`, `DealActions`, and `ListBulkActions` to hide Delete, and don't render Add buttons the user can't use. Copy `routes/_app/crm/organizations_.$organizationId.tsx`.
- Activity composers, completion controls, file uploads/deletes, affiliation menus, and deal stage moves check their own collection access. File UI lives in `modules/crm/components/files/`.
- `modules/crm/settings/pipeline-stages.tsx` uses `collectionPermissionsQuery` directly, for finer control.

## Errors, loading, toasts

- Loading and failed queries: `DataLoading` and `DataError` (`components/data-state.tsx`).
- Turn any caught error into a sentence with `errorMessage` (`lib/errors.ts`). It knows permission errors, conflicts, and duplicates.
- Toasts are Sonner (`toast` from `sonner`). The `Toaster` is mounted once in `shell/app-shell.tsx`.

CRM board and dashboard queries load all matching deals in 500-row pages (`readAllPages`), usually one request. Currency totals and dashboard charts stay separate per currency; no exchange rate is assumed. List paging and sorting helpers live in `lib/list-query.ts`.

## Dates and numbers

- Showing values: `formatDate`, `formatDateTime`, `formatMoney`, and `formatRelative` in `lib/format.ts`. `RelativeTime` (`components/relative-time.tsx`) shows "3 days ago" with the exact time in a tooltip.
- Date inputs and defaults ("later today", "next week"): `lib/dates.ts`.
- Portal (MySQL) times are UTC.
- Totals and dashboard charts stay separate per currency; no exchange rate is assumed.

## Copy

Put user-facing text in copy files, not in components. Shell and shared text is in `lib/app.copy.ts`, module text in `modules/<id>/<id>.copy.ts`, and module settings text in `modules/<id>/settings/settings.copy.ts`. Shared settings text is in `settings/settings.copy.ts`. Functions work for text with values in it (`appCopy.form.add(noun)`).

## Components

- `components/ui/` is shadcn/ui on Base UI (style `base-nova`, set in `apps/web/components.json`). Add a component with the shadcn CLI from `apps/web`, then adjust it here. Base UI composes with a `render` prop rather than Radix's `asChild`.
- `components/filters/` and `components/data-table/` are maintained here, derived from ReUI (MIT notices included). Use `ListFilters` and `DataTable` rather than their internals. Filter operators declare their Monospace `clause` in `filters/operators.ts`.
- The [component inventory](../apps/web/src/components/README.md) maps the shared parts and examples. `components/` itself holds the app's shared components (lists, forms, inline fields, page header).
- Module-specific components live in `modules/<id>/components/`.
- Shared avatars live in `components/avatars.tsx`. `EntityAvatar` and relation options use `variant: circle | square`.

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
