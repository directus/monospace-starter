import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, CircleDot, Factory, Globe } from 'lucide-react'

import { insertColumns } from '@/components/data-table/columns'
import { DataTableMobileRow } from '@/components/data-table/data-table'
import type { DataTableColumn } from '@/components/data-table/data-table'
import { ListTable } from '@/components/data-table/list-table'
import { dateField } from '@/components/filters/filter-date-editor'
import { ListBulkActions, ownerBulkField, statusBulkField } from '@/components/list-bulk-actions'
import { ListControls, ListAddButton } from '@/components/list-controls'
import { ListWorkspace } from '@/components/list-workspace'
import { UserLabel } from '@/components/users'
import { useListPage } from '@/hooks/use-list-page'
import { appCopy } from '@/lib/app.copy'
import { filtersToClause, relationField } from '@/lib/filters'
import type { ListFilterField, ListFilterQuery } from '@/lib/filters'
import { formatDate } from '@/lib/format'
import { listSearchSchema, parseSort } from '@/lib/list-search'
import { useCollectionAccess } from '@/lib/permissions'
import { lookupUsers, resolveUsers } from '@/lib/users'
import { OrganizationAvatar, OrganizationLabel } from '@/modules/crm/components/entities'
import { OrganizationDrawer } from '@/modules/crm/components/organization-form'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import { organizationsPagesQuery } from '@/modules/crm/data'
import type { OrganizationRow, OrganizationsFilter } from '@/modules/crm/data'
import { organizationName, organizationStatusOptions } from '@/modules/crm/entities'
import { OrganizationIcon, OwnerIcon } from '@/modules/crm/icons'
import { useDeleteManyOrganizations, useUpdateManyOrganizations } from '@/modules/crm/mutations'
import { organizationLists } from '@/modules/crm/slots'

const filterFields: Array<ListFilterField> = [
  {
    id: 'status',
    label: appCopy.common.status,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <CircleDot />,
    options: organizationStatusOptions,
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

function organizationColumns(rows: OrganizationRow[]): DataTableColumn<OrganizationRow>[] {
  return insertColumns(
    columns,
    organizationLists.flatMap((feature) =>
      feature.columns.map(({ before, component: Cell, ...column }) => ({
        before,
        column: {
          ...column,
          enableSorting: false,
          cell: ({ row }: { row: { original: OrganizationRow } }) => (
            <Cell organization={row.original} organizations={rows} />
          ),
        },
      })),
    ),
  )
}

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

  const page = useListPage({
    id: 'organizations',
    getColumns: organizationColumns,
    search,
    onSearchChange: (patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) }),
    params: Route.useLoaderDeps(),
    query: organizationsPagesQuery,
    selectable: true,
  })

  const { list: organizations, selectedIds, clearSelection } = page

  const updateMany = useUpdateManyOrganizations()
  const deleteMany = useDeleteManyOrganizations()

  return (
    <ListWorkspace
      title={crmCopy.organizations.title}
      icon={OrganizationIcon}
      controls={
        <ListControls
          state={page}
          fields={filterFields}
          title={crmCopy.organizations.title}
          icon={OrganizationIcon}
          defaultSort={{ id: 'name', desc: false, label: crmCopy.organizations.singular }}
          selection={
            selectedIds.length ? (
              <ListBulkActions
                canUpdate={access.canUpdate}
                ids={selectedIds}
                noun={crmCopy.organizations.title}
                singular={crmCopy.organizations.singular}
                fields={[statusBulkField(organizationStatusOptions), ownerBulkField]}
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
            access.create ? (
              <OrganizationDrawer
                trigger={<ListAddButton label={appCopy.form.add(crmCopy.organizations.singular)} />}
              />
            ) : null
          }
        />
      }
    >
      <ListTable
        query={organizations}
        {...page.tableProps}
        noun={crmCopy.organizations.title}
        mobileRow={(organization) => <OrganizationRowMobile organization={organization} />}
      />
    </ListWorkspace>
  )
}
