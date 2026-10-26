import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, CircleDot, Factory, Globe, Plus } from 'lucide-react'
import { useMemo } from 'react'

import { DataTable, DataTableMobileRow, useDataTable } from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { DataError, DataLoading } from '@/components/data-state'
import { ListBulkActions } from '@/components/list-bulk-actions'
import { DisplayMenu } from '@/components/display-menu'
import { useDeleteManyOrganizations, useUpdateManyOrganizations } from '@/modules/crm/mutations'
import { dateField } from '@/components/filter-date-editor'
import { FilterTrigger, FilterWell, ListFilters } from '@/components/list-filters'
import { ListToolbar } from '@/components/list-toolbar'
import { ListWorkspace } from '@/components/list-workspace'
import { createFilterQuery, isFilterQueryEmpty } from '@/components/reui/filters/filters'
import { Button } from '@/components/ui/button'
import { appCopy } from '@/lib/app.copy'
import { filtersToClause, relationField } from '@/lib/filters'
import type { FilterValue, ListFilterField, ListFilterQuery } from '@/lib/filters'
import { formatDate } from '@/lib/format'
import { listSearchSchema, parseSort, serializeSort } from '@/lib/list-search'
import {
  OrganizationAvatar,
  OrganizationLabel,
  organizationName,
} from '@/modules/crm/components/entities'
import { UserLabel } from '@/components/users'
import { OrganizationDrawer } from '@/modules/crm/components/organization-form'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import { OrganizationIcon, OwnerIcon } from '@/modules/crm/icons'
import { organizationsPagesQuery } from '@/modules/crm/data'
import { lookupUsers, resolveUsers } from '@/lib/user-options'
import { organizationLists } from '@/modules/organization-panels'
import type { OrganizationRow, OrganizationsFilter } from '@/modules/crm/data'
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
    options: Object.entries(crmCopy.organizations.statuses).map(([value, label]) => ({
      value,
      label,
    })),
  },
  relationField({
    id: 'owner',
    label: appCopy.common.owner,
    icon: <OwnerIcon />,
    placeholder: appCopy.form.searchPlaceholder(appCopy.common.owner),
    search: lookupUsers,
    resolve: resolveUsers,
    path: 'ownerUserId',
  }),
  { id: 'industry', label: crmCopy.organizations.industry, type: 'text', icon: <Factory /> },
  { id: 'domain', label: crmCopy.organizations.domain, type: 'text', icon: <Globe /> },
  dateField({
    id: 'updatedAt',
    label: appCopy.common.updated,
    icon: <CalendarDays />,
    defaultOperator: 'is_after',
  }),
  ...organizationLists.flatMap((feature) => feature.filters),
]

const EMPTY_QUERY = createFilterQuery<FilterValue>([])

function clauseFor(query: ListFilterQuery | undefined) {
  // SAFETY: filtersToClause only emits operators valid for each field type. The generated filter
  // schema can't check it yet (docs/monospace.md, known issues).
  return filtersToClause(filterFields, query) as OrganizationsFilter | undefined
}

export const Route = createFileRoute('/_app/crm/organizations')({
  staticData: {
    page: {
      title: crmCopy.organizations.title,
      icon: OrganizationIcon,
      module: 'crm',
      nav: 20,
      keywords: crmCopy.organizations.keywords,
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
  // Prefetch never throws. A plan or renewal filter reads the portal, so while the portal is down
  // the page shows the error under its filters, where the filter can be removed.
  loader: ({ context: { queryClient }, deps }) =>
    queryClient.prefetchInfiniteQuery(organizationsPagesQuery(deps)),
  component: OrganizationsPage,
})

const columns: Array<DataTableColumn<OrganizationRow>> = [
  {
    id: 'name',
    header: crmCopy.organizations.singular,
    accessorFn: (row) => row.name ?? '',
    size: 280,
    enableHiding: false,
    cell: ({ row }) => <OrganizationLabel organization={row.original} />,
  },
  {
    id: 'industry',
    header: crmCopy.organizations.industry,
    accessorFn: (row) => row.industry ?? '',
    size: 180,
    cell: ({ row }) => row.original.industry,
  },
  {
    id: 'status',
    header: appCopy.common.status,
    accessorFn: (row) => row.status ?? '',
    size: 130,
    cell: ({ row }) => <StatusBadge status={row.original.status ?? 'unknown'} />,
  },
  {
    id: 'owner',
    header: appCopy.common.owner,
    enableSorting: false,
    size: 200,
    cell: ({ row }) => <UserLabel user={row.original.owner} size="sm" />,
  },
  {
    id: 'domain',
    header: crmCopy.organizations.domain,
    accessorFn: (row) => row.domain ?? '',
    size: 200,
    cell: ({ row }) => row.original.domain,
  },
  {
    id: 'deals',
    header: crmCopy.organizations.openDeals,
    enableSorting: false,
    size: 120,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right tabular-nums' },
    cell: ({ row }) => row.original.opportunities?.data.length ?? 0,
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

function OrganizationRowMobile({ organization }: { organization: OrganizationRow }) {
  return (
    <DataTableMobileRow
      render={
        organization.id ? (
          <Link
            to="/crm/organizations/$organizationId"
            params={{ organizationId: organization.id }}
          />
        ) : undefined
      }
      leading={<OrganizationAvatar organization={organization} />}
      title={organizationName(organization)}
      meta={[organization.industry ?? organization.domain]}
      trailing={<StatusBadge status={organization.status ?? 'unknown'} />}
    />
  )
}

function OrganizationsPage() {
  const access = useCollectionAccess('organizations')
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const query = search.filters ?? EMPTY_QUERY
  const sort = parseSort(search.sort)

  const organizations = useInfiniteQuery(
    organizationsPagesQuery({ q: search.q, filter: clauseFor(query), sort }),
  )

  const rows = useMemo(() => organizations.data?.pages.flat() ?? [], [organizations.data])

  const { table, resetLayout, isDefaultLayout, onDragEnd, selectedIds, clearSelection } =
    useDataTable({
      id: 'organizations',
      columns: [
        ...columns.slice(0, -1),
        ...organizationLists.flatMap((feature) =>
          feature.columns.map(({ component: Cell, ...column }) => ({
            ...column,
            enableSorting: false,
            cell: ({ row }: { row: { original: OrganizationRow } }) => (
              <Cell
                accountId={row.original.portalAccountId}
                accountIds={rows.map((item) => item.portalAccountId)}
              />
            ),
          })),
        ),
        ...columns.slice(-1),
      ],
      rows,
      getRowId: (row) => row.id,
      sort,
      onSortChange: (next) =>
        navigate({ search: (previous) => ({ ...previous, sort: serializeSort(next) }) }),
      selectable: true,
      selectionKey: JSON.stringify([search.q, search.filters, search.sort]),
    })

  const updateMany = useUpdateManyOrganizations()
  const deleteMany = useDeleteManyOrganizations()

  return (
    <ListWorkspace
      title={crmCopy.organizations.title}
      icon={OrganizationIcon}
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
            title={crmCopy.organizations.title}
            icon={OrganizationIcon}
            query={search.q ?? ''}
            onQueryChange={(q) => navigate({ search: (previous) => ({ ...previous, q }) })}
            selection={
              selectedIds.length ? (
                <ListBulkActions
                  ids={selectedIds}
                  noun={crmCopy.organizations.title}
                  singular={crmCopy.organizations.singular}
                  fields={[
                    {
                      name: 'status',
                      label: appCopy.common.status,
                      kind: 'select',
                      options: Object.entries(crmCopy.organizations.statuses).map(
                        ([value, label]) => ({
                          value,
                          label,
                        }),
                      ),
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
                  defaultSort={{
                    id: 'name',
                    desc: false,
                    label: crmCopy.organizations.singular,
                  }}
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
                  <OrganizationDrawer
                    trigger={
                      <Button className="max-md:ml-auto max-md:w-10 max-md:px-0!">
                        <Plus data-icon="inline-start" />
                        <span className="max-md:sr-only">
                          {appCopy.form.add(crmCopy.organizations.singular)}
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
      {organizations.isPending ? <DataLoading className="max-md:mx-4" /> : null}
      {organizations.isError ? (
        <DataError error={organizations.error} className="max-md:mx-4" />
      ) : null}
      {organizations.data ? (
        <>
          <DataTable
            table={table}
            onDragEnd={onDragEnd}
            noun={crmCopy.organizations.title}
            hasMore={organizations.hasNextPage}
            isLoadingMore={organizations.isFetchingNextPage}
            onLoadMore={() => void organizations.fetchNextPage()}
            mobileRow={(organization) => <OrganizationRowMobile organization={organization} />}
          />
        </>
      ) : null}
    </ListWorkspace>
  )
}
