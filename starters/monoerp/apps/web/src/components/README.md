# Shared components

Use the page wrappers. Grid and filter internals belong to those wrappers.

| Group      | Components                                                                                          | Use for                                                  | Example                                                     |
| ---------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Lists      | `ListWorkspace`, `ListControls`, `ListAddButton`, `ListTable`, `ListBulkActions`                    | Search, filters, server sorting, paging and bulk changes | `modules/crm/routes/app/organizations.tsx`                  |
| Records    | `PageHeader`, `RecordTitle`, `RecordName`, `RecordDetails`, `RecordMenu`, `PropertyList`, `Inline*` | Detail pages and small field edits                       | `modules/crm/routes/app/organizations_.$organizationId.tsx` |
| Forms      | `useAppForm`, `submitForm`, `FormDrawer`, `FormDialog`, `RelationField`, validators                 | Create and full edit forms                               | `modules/crm/components/organization-form.tsx`              |
| Feedback   | `DataLoading`, `DataError`, `SectionBoundary`, `Empty`, `Unlinked`, toasts                          | Loading, failures and empty panels                       | `connectors/stripe/frontend/crm/billing-panel.tsx`          |
| People     | `UserLabel`, `UserAvatar`, `InlineOwner`, `EntityAvatar`                                            | Owners and record images                                 | `modules/crm/components/entities.tsx`                       |
| Content    | `NotesEditor`, `PdfViewer`, `RelativeTime`                                                          | Notes, file previews and dates                           | `modules/crm/components/files/panel.tsx`                    |
| Primitives | `ui/*`                                                                                              | Buttons, inputs, menus and dialogs                       | shadcn CLI from `apps/web`                                  |

`data-table/` owns virtual rows, pinned columns, sizing, the header menu, and the display menu. Both header handles and the display list reorder columns with `@dnd-kit/react`. Sorting and paging stay on the server. Layout persists per table; selection resets when search changes.

`filters/` owns the cascader flow: searchable fields, operators, then the value editor. The two lists share a small cascader whose highlight follows option values when selected rows move. It supports keyboard selection, Home/End, empty states, async relation search, value resolution, and multi-select. TanStack Virtual renders the visible options plus the highlighted option, measures descriptions and dividers, and scrolls keyboard highlights into view. `aria-activedescendant` always names a rendered option, including after manual scrolling or Home/End. Queries hold flat AND rules. `lib/filters.tsx` exposes the page-facing query helpers and compiles rules into Monospace clauses.

These components started from ReUI (MIT) and are maintained here, without upstream syncing. Each folder retains its license notice.

`ui/` is shadcn on Base UI, adjusted for this app. `frame.tsx` and `date-picker.tsx` are ours, kept here because they behave like primitives. `avatars.tsx`, `form/checkbox-card.tsx`, and `panel.tsx` are app components. `pdf-viewer.tsx` stays shared as a Monospace file-preview example for any module.

- Shared strings come from `lib/app.copy.ts`; module copy stays with the module.
- Module-only components belong in `modules/<id>/components/`.
- Use `useListPage`, `ListControls`, and `ListTable`; pages should not import grid or filter internals. Activity uses `useListSearch` with its bucket queries.
