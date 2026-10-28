import { Link, createFileRoute } from '@tanstack/react-router'
import { Building2, CircleDot, Flame } from 'lucide-react'

import { DataTableMobileRow } from '@/components/data-table/data-table'
import type { DataTableColumn } from '@/components/data-table/data-table'
import { ListTable } from '@/components/data-table/list-table'
import { ListControls } from '@/components/list-controls'
import { ListWorkspace } from '@/components/list-workspace'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserLabel } from '@/components/users'
import { useListPage } from '@/hooks/use-list-page'
import { appCopy } from '@/lib/app.copy'
import { EMPTY_FILTERS, createFilterQuery } from '@/lib/filters'
import { filtersToClause, relationField } from '@/lib/filters'
import type { FilterValue, ListFilterField, ListFilterQuery } from '@/lib/filters'
import { formatDate } from '@/lib/format'
import { listSearchSchema, parseSort } from '@/lib/list-search'
import { lookupUsers, resolveUsers } from '@/lib/users'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import { JobStatusBadge, UrgencyBadge } from '@/modules/ats/components/jobs/job-badges'
import { NewJobMenu } from '@/modules/ats/components/jobs/new-job-menu'
import { daysSince, jobsPagesQuery, reqLabel, splitLocations } from '@/modules/ats/data/jobs'
import type { JobRow, JobsFilter } from '@/modules/ats/data/jobs'
import { lookupDepartments, resolveDepartments } from '@/modules/ats/data/shared'
import { JobIcon } from '@/modules/ats/icons'

const copy = atsCopy.jobs

const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))

const filterFields: Array<ListFilterField> = [
  {
    id: 'status',
    label: appCopy.common.status,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <CircleDot />,
    options: options(atsCopy.options.requisitionStatus),
  },
  relationField({
    id: 'department',
    label: copy.columns.department,
    icon: <Building2 />,
    placeholder: appCopy.form.searchPlaceholder(copy.columns.department),
    search: lookupDepartments,
    resolve: resolveDepartments,
    path: 'departmentId',
  }),
  relationField({
    id: 'hiringManager',
    label: copy.columns.hiringManager,
    icon: <JobIcon />,
    placeholder: appCopy.form.searchPlaceholder(copy.columns.hiringManager),
    search: lookupUsers,
    resolve: resolveUsers,
    path: 'hiringManagerUserId',
  }),
  relationField({
    id: 'recruiter',
    label: copy.columns.recruiter,
    icon: <JobIcon />,
    placeholder: appCopy.form.searchPlaceholder(copy.columns.recruiter),
    search: lookupUsers,
    resolve: resolveUsers,
    path: 'recruiterUserId',
  }),
  {
    id: 'urgency',
    label: copy.columns.urgency,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <Flame />,
    options: options(atsCopy.options.urgency),
  },
]

// With no filters in the URL the list shows open jobs. Clearing them keeps an empty query in the
// URL, so "everything" is a view you can land on too.
const OPEN_JOBS: ListFilterQuery = {
  ...createFilterQuery<FilterValue>([]),
  rules: [
    { id: 'status-open', type: 'rule', path: ['status'], operator: 'is_any_of', value: ['open'] },
  ],
}

function clauseFor(query: ListFilterQuery | undefined) {
  // SAFETY: filtersToClause only emits operators valid for each field type. The generated filter
  // schema can't check it yet (docs/monospace.md, known issues).
  return filtersToClause(filterFields, query ?? OPEN_JOBS) as JobsFilter | undefined
}

export const Route = createFileRoute('/_app/ats/jobs')({
  staticData: {
    page: {
      title: copy.title,
      icon: JobIcon,
      module: 'ats',
      nav: 20,
      keywords: [...copy.keywords],
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
    await queryClient.infiniteQuery({ ...jobsPagesQuery(deps), staleTime: 'static' })
  },
  component: JobsPage,
})

function Count({ value, tone }: { value: number; tone?: 'new' }) {
  return (
    <span
      className={cn(
        value === 0 && 'text-muted-foreground/60',
        tone === 'new' && value > 0 && 'font-medium text-success',
      )}
    >
      {tone === 'new' && value > 0 ? `+${value}` : value}
    </span>
  )
}

// One opening reads as "1". More show their slots so a recruiter can talk about "#2".
function Openings({ count }: { count: number }) {
  if (count <= 1) return <span>{count}</span>

  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex items-baseline gap-1.5 align-baseline" />}
      >
        <span>{count}</span>
        <span className="text-xs text-muted-foreground">
          {count <= 3 ? copy.openingSlots(count) : `#1–#${count}`}
        </span>
      </TooltipTrigger>
      <TooltipContent>{copy.openings(count)}</TooltipContent>
    </Tooltip>
  )
}

function jobAge(row: JobRow) {
  return daysSince(row.openedAt ?? row.createdAt)
}

const columns: Array<DataTableColumn<JobRow>> = [
  {
    id: 'reqNumber',
    header: copy.columns.req,
    accessorFn: (row) => row.reqNumber ?? 0,
    size: 110,
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {reqLabel(row.original.reqNumber)}
      </span>
    ),
  },
  {
    id: 'title',
    header: copy.columns.title,
    accessorFn: (row) => row.title ?? '',
    size: 280,
    enableHiding: false,
    cell: ({ row }) => (
      <Link
        to="/ats/jobs/$jobId"
        params={{ jobId: row.original.id }}
        className="truncate font-medium hover:underline"
      >
        {row.original.title ?? copy.restricted}
      </Link>
    ),
  },
  {
    id: 'status',
    header: appCopy.common.status,
    accessorFn: (row) => row.status ?? '',
    size: 120,
    cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
  },
  {
    id: 'active',
    header: copy.columns.active,
    enableSorting: false,
    size: 90,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right tabular-nums' },
    cell: ({ row }) => <Count value={row.original.activeCount} />,
  },
  {
    id: 'new',
    header: copy.columns.newThisWeek,
    enableSorting: false,
    size: 100,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right tabular-nums' },
    cell: ({ row }) => <Count value={row.original.newCount} tone="new" />,
  },
  {
    id: 'openings',
    header: copy.columns.openings,
    accessorFn: (row) => row.numberOfHires ?? 1,
    size: 130,
    meta: { cellClassName: 'tabular-nums' },
    cell: ({ row }) => <Openings count={row.original.numberOfHires ?? 1} />,
  },
  {
    id: 'urgency',
    header: copy.columns.urgency,
    accessorFn: (row) => row.urgency ?? '',
    size: 110,
    cell: ({ row }) => <UrgencyBadge urgency={row.original.urgency} />,
  },
  {
    id: 'department',
    header: copy.columns.department,
    enableSorting: false,
    size: 140,
    cell: ({ row }) => row.original.departments?.name,
  },
  {
    id: 'level',
    header: copy.columns.level,
    enableSorting: false,
    size: 90,
    cell: ({ row }) => row.original.job_levels?.name,
  },
  {
    id: 'hiringManager',
    header: copy.columns.hiringManager,
    enableSorting: false,
    size: 180,
    cell: ({ row }) => <UserLabel user={row.original.hiringManagerUser} size="sm" />,
  },
  {
    id: 'recruiter',
    header: copy.columns.recruiter,
    enableSorting: false,
    size: 180,
    cell: ({ row }) => <UserLabel user={row.original.recruiterUser} size="sm" />,
  },
  {
    id: 'locations',
    header: copy.columns.locations,
    enableSorting: false,
    size: 200,
    cell: ({ row }) => (
      <span className="truncate text-muted-foreground">
        {splitLocations(row.original.locations).join(', ')}
      </span>
    ),
  },
  {
    id: 'age',
    header: copy.columns.age,
    accessorFn: jobAge,
    size: 90,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right text-muted-foreground' },
    cell: ({ row }) => (
      <Tooltip>
        <TooltipTrigger render={<span className="tabular-nums" />}>
          {copy.ageDays(jobAge(row.original))}
        </TooltipTrigger>
        <TooltipContent>
          {row.original.openedAt
            ? `${copy.overview.opened} ${formatDate(row.original.openedAt)}`
            : `${copy.overview.created} ${formatDate(row.original.createdAt)}`}
        </TooltipContent>
      </Tooltip>
    ),
  },
]

function JobRowMobile({ job }: { job: JobRow }) {
  return (
    <DataTableMobileRow
      render={<Link to="/ats/jobs/$jobId" params={{ jobId: job.id }} />}
      title={job.title ?? copy.restricted}
      meta={[
        [reqLabel(job.reqNumber), job.departments?.name, job.job_levels?.name]
          .filter(Boolean)
          .join(' · '),
        [
          copy.activeCandidates(job.activeCount),
          job.newCount ? copy.newThisWeek(job.newCount) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      ]}
      trailing={<JobStatusBadge status={job.status} />}
    />
  )
}

function JobsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const page = useListPage({
    id: 'ats-jobs',
    columns,
    search: { ...search, filters: search.filters ?? OPEN_JOBS },
    onSearchChange: (patch) =>
      navigate({
        search: (previous) => ({
          ...previous,
          ...patch,
          filters: 'filters' in patch ? (patch.filters ?? EMPTY_FILTERS) : previous.filters,
        }),
      }),
    params: Route.useLoaderDeps(),
    query: jobsPagesQuery,
  })

  const { list: jobs, rows } = page

  return (
    <ListWorkspace
      title={copy.title}
      icon={JobIcon}
      controls={
        <ListControls
          state={page}
          fields={filterFields}
          title={copy.title}
          icon={JobIcon}
          defaultSort={{ id: 'reqNumber', desc: true, label: copy.columns.req }}
          action={<NewJobMenu compact />}
        />
      }
    >
      {jobs.data && rows.length === 0 && !jobs.hasNextPage ? (
        <div className="m-4 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center sm:mx-6">
          <JobIcon className="mb-3 size-6 text-muted-foreground" />
          <h2 className="font-medium">
            {search.q || search.filters ? copy.create.emptyFiltered : copy.create.emptyTitle}
          </h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {copy.create.emptyDescription}
          </p>
          <NewJobMenu className="mt-5" />
        </div>
      ) : (
        <ListTable
          query={jobs}
          {...page.tableProps}
          noun={copy.title}
          mobileRow={(job) => <JobRowMobile job={job} />}
        />
      )}
    </ListWorkspace>
  )
}
