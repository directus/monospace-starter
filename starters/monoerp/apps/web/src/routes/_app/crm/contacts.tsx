import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Briefcase, CircleDot, Mail, Plus } from 'lucide-react'
import { useMemo } from 'react'

import { DataTable, DataTableMobileRow, useDataTable } from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { DataError, DataLoading } from '@/components/data-state'
import { ListBulkActions } from '@/components/list-bulk-actions'
import { DisplayMenu } from '@/components/display-menu'
import { useDeleteManyContacts, useUpdateManyContacts } from '@/modules/crm/mutations'
import { FilterTrigger, FilterWell, ListFilters } from '@/components/list-filters'
import { ListToolbar } from '@/components/list-toolbar'
import { ListWorkspace } from '@/components/list-workspace'
import { createFilterQuery, isFilterQueryEmpty } from '@/components/reui/filters/filters'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { appCopy } from '@/lib/app.copy'
import { filtersToClause, relationField } from '@/lib/filters'
import type { FilterValue, ListFilterField, ListFilterQuery } from '@/lib/filters'
import { formatDate } from '@/lib/format'
import { listSearchSchema, parseSort, serializeSort } from '@/lib/list-search'
import { groupAffiliations, groupTitle } from '@/modules/crm/affiliations'
import { ContactDrawer } from '@/modules/crm/components/contact-form'
import {
  ContactAvatar,
  ContactLabel,
  OrganizationLabel,
  contactName,
  organizationName,
} from '@/modules/crm/components/entities'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import { ContactIcon, OrganizationIcon } from '@/modules/crm/icons'
import { contactsPagesQuery, lookupOrganizations, resolveOrganizations } from '@/modules/crm/data'
import { lookupUsers } from '@/lib/user-options'
import type { ContactRow, ContactsFilter } from '@/modules/crm/data'
import { useCollectionAccess } from '@/lib/permissions'

const filterFields: Array<ListFilterField> = [
  {
    id: 'status',
    label: appCopy.common.status,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <CircleDot />,
    options: Object.entries(crmCopy.contacts.statuses).map(([value, label]) => ({ value, label })),
  },
  relationField({
    id: 'organization',
    label: crmCopy.organizations.singular,
    icon: <OrganizationIcon />,
    placeholder: appCopy.form.searchPlaceholder(crmCopy.organizations.title),
    search: lookupOrganizations,
    resolve: resolveOrganizations,
    toClause: (clause) => ({ contact_organizations: { _some: { organizationId: clause } } }),
  }),
  {
    id: 'title',
    label: crmCopy.contacts.jobTitle,
    type: 'text',
    icon: <Briefcase />,
    toClause: (clause) => ({ contact_organizations: { _some: { title: clause } } }),
  },
  { id: 'email', label: crmCopy.contacts.form.email, type: 'text', icon: <Mail /> },
]

const EMPTY_QUERY = createFilterQuery<FilterValue>([])

function clauseFor(query: ListFilterQuery | undefined) {
  // SAFETY: filtersToClause only emits operators valid for each field type. The generated filter
  // schema can't check it yet (docs/monospace.md, known issues).
  return filtersToClause(filterFields, query) as ContactsFilter | undefined
}

export const Route = createFileRoute('/_app/crm/contacts')({
  staticData: {
    page: {
      title: crmCopy.contacts.title,
      icon: ContactIcon,
      module: 'crm',
      nav: 30,
      keywords: crmCopy.contacts.keywords,
      fullWidth: true,
      fill: true,
    },
  },
  validateSearch: listSearchSchema,
  loaderDeps: ({ search }) => ({
    q: search.q,
    filter: clauseFor(search.filters),
    sort: parseSort(search.sort),
  }),
  loader: ({ context: { queryClient }, deps }) =>
    queryClient.ensureInfiniteQueryData(contactsPagesQuery(deps)),
  component: ContactsPage,
})

function groupsFor(contact: ContactRow) {
  return groupAffiliations(
    contact.contact_organizations?.data ?? [],
    (row) => row.organizations?.id,
  ).filter((group) => !group.isFormer)
}

// One organization per row keeps row heights uniform; the rest sit behind a "+N" that opens on
// hover or click.
function OrganizationsCell({ contact }: { contact: ContactRow }) {
  const groups = groupsFor(contact)
  const [first, ...rest] = groups

  if (!first) return null

  return (
    <div className="flex min-w-0 items-center gap-2">
      <OrganizationLabel organization={first.current?.organizations} size="sm" />
      {rest.length ? (
        <Popover>
          <PopoverTrigger
            openOnHover
            delay={150}
            render={
              <button
                type="button"
                aria-label={crmCopy.contacts.moreOrganizations(rest.length)}
                className="relative inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1.5 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-muted data-[popup-open]:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
              />
            }
          >
            +{rest.length}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-48 gap-2 p-2">
            {rest.map((group) => (
              <OrganizationLabel
                key={group.key}
                organization={group.current?.organizations}
                size="sm"
              />
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}

const columns: Array<DataTableColumn<ContactRow>> = [
  {
    id: 'name',
    header: crmCopy.contacts.singular,
    accessorFn: (row) => row.lastName ?? '',
    size: 260,
    enableHiding: false,
    cell: ({ row }) => <ContactLabel contact={row.original} />,
  },
  {
    id: 'title',
    header: crmCopy.contacts.jobTitle,
    enableSorting: false,
    cell: ({ row }) => groupsFor(row.original).map(groupTitle).find(Boolean) ?? null,
  },
  {
    id: 'organizations',
    header: crmCopy.organizations.title,
    enableSorting: false,
    size: 240,
    cell: ({ row }) => <OrganizationsCell contact={row.original} />,
  },
  {
    id: 'email',
    header: crmCopy.contacts.form.email,
    accessorFn: (row) => row.email ?? '',
    size: 220,
    cell: ({ row }) => row.original.email,
  },
  {
    id: 'status',
    header: appCopy.common.status,
    accessorFn: (row) => row.status ?? '',
    size: 120,
    cell: ({ row }) => <StatusBadge status={row.original.status ?? 'unknown'} />,
  },
  {
    id: 'updatedAt',
    header: appCopy.common.updated,
    accessorFn: (row) => row.updatedAt ?? '',
    size: 130,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right text-muted-foreground' },
    cell: ({ row }) => formatDate(row.original.updatedAt),
  },
]

function ContactRowMobile({ contact }: { contact: ContactRow }) {
  const groups = groupsFor(contact)

  const meta = [
    groups.map(groupTitle).find(Boolean),
    groups[0] ? organizationName(groups[0].current?.organizations) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <DataTableMobileRow
      render={
        contact.id ? (
          <Link to="/crm/contacts/$contactId" params={{ contactId: contact.id }} />
        ) : undefined
      }
      leading={<ContactAvatar contact={contact} />}
      title={contactName(contact)}
      meta={[meta || contact.email]}
    />
  )
}

function ContactsPage() {
  const access = useCollectionAccess('contacts')
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const query = search.filters ?? EMPTY_QUERY
  const sort = parseSort(search.sort)

  const contacts = useInfiniteQuery(
    contactsPagesQuery({ q: search.q, filter: clauseFor(query), sort }),
  )

  const rows = useMemo(() => contacts.data?.pages.flat() ?? [], [contacts.data])

  const { table, resetLayout, isDefaultLayout, onDragEnd, selectedIds, clearSelection } =
    useDataTable({
      id: 'contacts',
      columns,
      rows,
      getRowId: (row) => row.id,
      sort,
      onSortChange: (next) =>
        navigate({ search: (previous) => ({ ...previous, sort: serializeSort(next) }) }),
      selectable: true,
      selectionKey: JSON.stringify([search.q, search.filters, search.sort]),
    })

  const updateMany = useUpdateManyContacts()
  const deleteMany = useDeleteManyContacts()

  return (
    <ListWorkspace
      title={crmCopy.contacts.title}
      icon={ContactIcon}
      controls={
        <ListFilters
          fields={filterFields}
          query={query}
          onQueryChange={(next) =>
            navigate({
              search: (previous) => ({
                ...previous,
                filters: isFilterQueryEmpty(next) ? undefined : next,
              }),
            })
          }
        >
          <ListToolbar
            title={crmCopy.contacts.title}
            icon={ContactIcon}
            query={search.q ?? ''}
            onQueryChange={(q) => navigate({ search: (previous) => ({ ...previous, q }) })}
            selection={
              selectedIds.length ? (
                <ListBulkActions
                  ids={selectedIds}
                  noun={crmCopy.contacts.title}
                  singular={crmCopy.contacts.singular}
                  fields={[
                    {
                      name: 'status',
                      label: appCopy.common.status,
                      kind: 'select',
                      options: Object.entries(crmCopy.contacts.statuses).map(([value, label]) => ({
                        value,
                        label,
                      })),
                    },
                    {
                      name: 'ownerUserId',
                      label: appCopy.common.owner,
                      kind: 'relation',
                      search: lookupUsers,
                      placeholder: appCopy.inline.assign,
                      searchPlaceholder: appCopy.form.searchPlaceholder(appCopy.common.owner),
                    },
                  ]}
                  onClear={clearSelection}
                  onUpdate={async (ids, data) => {
                    await updateMany.mutateAsync({ ids, data })
                  }}
                  onDelete={
                    access.delete
                      ? async (ids) => {
                          await deleteMany.mutateAsync(ids)
                        }
                      : undefined
                  }
                  deleting={deleteMany.isPending}
                  deleteError={deleteMany.error}
                />
              ) : undefined
            }
            action={
              <>
                <DisplayMenu
                  sort={sort}
                  defaultSort={{ id: 'name', desc: false, label: crmCopy.contacts.singular }}
                  onSortChange={(next) =>
                    navigate({
                      search: (previous) => ({ ...previous, sort: serializeSort(next) }),
                    })
                  }
                  table={table}
                  isDefaultLayout={isDefaultLayout}
                  onResetColumns={resetLayout}
                />
                {access.create ? (
                  <ContactDrawer
                    trigger={
                      <Button className="max-md:ml-auto max-md:w-10 max-md:px-0!">
                        <Plus data-icon="inline-start" />
                        <span className="max-md:sr-only">
                          {appCopy.form.add(crmCopy.contacts.singular)}
                        </span>
                      </Button>
                    }
                  />
                ) : null}
              </>
            }
          >
            <FilterTrigger />
          </ListToolbar>
          <FilterWell />
        </ListFilters>
      }
    >
      {contacts.isPending ? <DataLoading className="max-md:mx-4" /> : null}
      {contacts.isError ? <DataError error={contacts.error} className="max-md:mx-4" /> : null}
      {contacts.data ? (
        <>
          <DataTable
            table={table}
            onDragEnd={onDragEnd}
            noun={crmCopy.contacts.title}
            hasMore={contacts.hasNextPage}
            isLoadingMore={contacts.isFetchingNextPage}
            onLoadMore={() => void contacts.fetchNextPage()}
            mobileRow={(contact) => <ContactRowMobile contact={contact} />}
          />
        </>
      ) : null}
    </ListWorkspace>
  )
}
