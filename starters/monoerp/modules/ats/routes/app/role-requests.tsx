import { noop } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Building2, CalendarDays, CircleDot, Flame } from 'lucide-react'
import { CircleUserRound } from 'lucide-react'
import { useState } from 'react'

import { DataTableMobileRow } from '@/components/data-table/data-table'
import type { DataTableColumn } from '@/components/data-table/data-table'
import { ListTable } from '@/components/data-table/list-table'
import { dateField } from '@/components/filters/filter-date-editor'
import { ListControls, ListAddButton } from '@/components/list-controls'
import { ListWorkspace } from '@/components/list-workspace'
import { Badge } from '@/components/ui/badge'
import { UserLabel } from '@/components/users'
import { useListPage } from '@/hooks/use-list-page'
import { appCopy } from '@/lib/app.copy'
import { filtersToClause, relationField } from '@/lib/filters'
import type { ListFilterField, ListFilterQuery } from '@/lib/filters'
import { formatDate } from '@/lib/format'
import { listSearchSchema, parseSort } from '@/lib/list-search'
import { lookupUsers, resolveUsers } from '@/lib/users'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { UrgencyBadge } from '@/modules/ats/components/jobs/job-badges'
import { optionsFor } from '@/modules/ats/components/requests/form-helpers'
import { RequestStatusBadge } from '@/modules/ats/components/requests/request-badges'
import { RoleRequestDrawer } from '@/modules/ats/components/requests/role-request-form'
import { roleRequestsPagesQuery } from '@/modules/ats/data/requests'
import type { RoleRequestRow, RoleRequestsFilter } from '@/modules/ats/data/requests'
import { lookupDepartments, resolveDepartments } from '@/modules/ats/data/shared'
import { RoleRequestIcon } from '@/modules/ats/icons'

const copy = atsCopy.requests.requests

const columnsCopy = copy.columns

const filterFields: Array<ListFilterField> = [
  {
    id: 'status',
    label: columnsCopy.status,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <CircleDot />,
    options: optionsFor('requestStatus'),
  },
  relationField({
    id: 'department',
    label: columnsCopy.department,
    icon: <Building2 />,
    placeholder: appCopy.form.searchPlaceholder(columnsCopy.department),
    search: lookupDepartments,
    resolve: resolveDepartments,
    path: 'departmentId',
  }),
  {
    id: 'urgency',
    label: columnsCopy.urgency,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <Flame />,
    options: optionsFor('urgency'),
  },
  relationField({
    id: 'hiringManager',
    label: columnsCopy.hiringManager,
    icon: <CircleUserRound />,
    placeholder: appCopy.form.searchPlaceholder(columnsCopy.hiringManager),
    search: lookupUsers,
    resolve: resolveUsers,
    path: 'hiringManagerUserId',
  }),
  dateField({
    id: 'createdAt',
    label: columnsCopy.submitted,
    icon: <CalendarDays />,
    defaultOperator: 'is_after',
  }),
]

function clauseFor(query: ListFilterQuery | undefined) {
  // SAFETY: filtersToClause only emits operators valid for each field type. The generated filter
  // schema can't check it yet (docs/monospace.md, known issues).
  return filtersToClause(filterFields, query) as RoleRequestsFilter | undefined
}

export const Route = createFileRoute('/_app/ats/role-requests')({
  staticData: {
    page: {
      title: copy.title,
      icon: RoleRequestIcon,
      module: 'ats',
      nav: 60,
      keywords: copy.keywords,
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
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient
      .infiniteQuery({ ...roleRequestsPagesQuery(deps), staleTime: 'static' })
      .catch(noop)
  },
  component: RoleRequestsPage,
})

const columns: Array<DataTableColumn<RoleRequestRow>> = [
  {
    id: 'roleName',
    header: columnsCopy.role,
    accessorFn: (row) => row.roleName ?? '',
    size: 260,
    enableHiding: false,
    cell: ({ row }) => (
      <Link
        to="/ats/role-requests/$requestId"
        params={{ requestId: row.original.id }}
        className="truncate font-medium hover:underline"
      >
        {row.original.roleName}
      </Link>
    ),
  },
  {
    id: 'status',
    header: columnsCopy.status,
    accessorFn: (row) => row.status ?? '',
    size: 180,
    cell: ({ row }) => <RequestStatusBadge status={row.original.status} />,
  },
  {
    id: 'department',
    header: columnsCopy.department,
    enableSorting: false,
    size: 160,
    cell: ({ row }) => row.original.departments?.name,
  },
  {
    id: 'level',
    header: columnsCopy.level,
    enableSorting: false,
    size: 110,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.job_levels?.name}</span>
    ),
  },
  {
    id: 'plan',
    header: columnsCopy.plan,
    enableSorting: false,
    size: 130,
    cell: ({ row }) =>
      row.original.workforcePlanRoleId ? (
        <Badge variant="outline">{copy.inPlan}</Badge>
      ) : (
        <span className="text-muted-foreground">{copy.notInPlan}</span>
      ),
  },
  {
    id: 'hiringManager',
    header: columnsCopy.hiringManager,
    enableSorting: false,
    size: 190,
    cell: ({ row }) => <UserLabel user={row.original.hiringManagerUser} size="sm" />,
  },
  {
    id: 'requester',
    header: columnsCopy.requester,
    enableSorting: false,
    size: 190,
    cell: ({ row }) => <UserLabel user={row.original.requesterUser} size="sm" />,
  },
  {
    id: 'numberOfHires',
    header: columnsCopy.hires,
    accessorFn: (row) => row.numberOfHires ?? 0,
    size: 90,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right tabular-nums' },
    cell: ({ row }) => row.original.numberOfHires,
  },
  {
    id: 'urgency',
    header: columnsCopy.urgency,
    accessorFn: (row) => row.urgency ?? '',
    size: 120,
    cell: ({ row }) => <UrgencyBadge urgency={row.original.urgency} />,
  },
  {
    id: 'job',
    header: columnsCopy.job,
    enableSorting: false,
    size: 120,
    cell: ({ row }) => {
      const job = row.original.requisitions

      return job?.id && job.reqNumber ? (
        <Link
          to="/ats/jobs/$jobId"
          params={{ jobId: job.id }}
          className="font-mono text-xs hover:underline"
        >
          REQ-{job.reqNumber}
        </Link>
      ) : null
    },
  },
  {
    id: 'createdAt',
    header: columnsCopy.submitted,
    accessorFn: (row) => row.createdAt ?? '',
    size: 130,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right text-muted-foreground' },
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
]

function RoleRequestMobileRow({ request }: { request: RoleRequestRow }) {
  return (
    <DataTableMobileRow
      render={<Link to="/ats/role-requests/$requestId" params={{ requestId: request.id }} />}
      title={request.roleName}
      meta={[
        [
          request.departments?.name,
          request.job_levels?.name,
          optionLabel('urgency', request.urgency),
        ]
          .filter(Boolean)
          .join(' · '),
      ]}
      trailing={<RequestStatusBadge status={request.status} />}
    />
  )
}

function RoleRequestsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const page = useListPage({
    id: 'ats-role-requests',
    columns,
    search,
    onSearchChange: (patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) }),
    params: Route.useLoaderDeps(),
    query: roleRequestsPagesQuery,
  })

  const { list: requests } = page

  const [creating, setCreating] = useState(false)

  return (
    <ListWorkspace
      title={copy.title}
      icon={RoleRequestIcon}
      controls={
        <ListControls
          state={page}
          fields={filterFields}
          title={copy.title}
          icon={RoleRequestIcon}
          defaultSort={{ id: 'createdAt', desc: true, label: columnsCopy.submitted }}
          action={<ListAddButton label={copy.newRequest} onClick={() => setCreating(true)} />}
        />
      }
    >
      <ListTable
        query={requests}
        {...page.tableProps}
        noun={copy.title}
        mobileRow={(request) => <RoleRequestMobileRow request={request} />}
      />
      <RoleRequestDrawer open={creating} onOpenChange={setCreating} />
    </ListWorkspace>
  )
}
