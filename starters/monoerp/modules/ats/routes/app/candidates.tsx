import { noop } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Briefcase,
  CalendarDays,
  CircleDot,
  Kanban,
  ShieldAlert,
  Tag,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

import { DataTableMobileRow } from '@/components/data-table/data-table'
import type { DataTableColumn } from '@/components/data-table/data-table'
import { ListTable } from '@/components/data-table/list-table'
import { dateField } from '@/components/filters/filter-date-editor'
import { ListBulkActions } from '@/components/list-bulk-actions'
import { ListControls, ListAddButton } from '@/components/list-controls'
import { ListWorkspace } from '@/components/list-workspace'
import { RelativeTime } from '@/components/relative-time'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { candidatesUpdateOneInput } from '@/generated/monospace'
import { useListPage } from '@/hooks/use-list-page'
import { appCopy } from '@/lib/app.copy'
import { todayInput } from '@/lib/dates'
import { filtersToClause, relationField } from '@/lib/filters'
import type { FilterClause, ListFilterField, ListFilterQuery } from '@/lib/filters'
import { formatDate } from '@/lib/format'
import { listSearchSchema, parseSort } from '@/lib/list-search'
import { useCollectionAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { CandidateFormDrawer } from '@/modules/ats/components/candidates/candidate-form'
import {
  CandidateAvatar,
  CandidateLabel,
  ConsentStatus,
  MultiJobBadge,
  RetentionBadge,
  TagList,
  candidateName,
  isPastRetention,
  locationLabel,
  sourceLabel,
} from '@/modules/ats/components/candidates/candidate-labels'
import {
  candidatesPagesQuery,
  lookupRequisitions,
  lookupStageNames,
  resolveRequisitions,
} from '@/modules/ats/data/candidates'
import type { CandidateRow, CandidatesFilter } from '@/modules/ats/data/candidates'
import { CandidateIcon, TalentPoolIcon } from '@/modules/ats/icons'
import { useUpdateManyCandidates } from '@/modules/ats/mutations/candidates'

const copy = atsCopy.candidates

const sourceOptions = Object.entries(atsCopy.options.source).map(([value, label]) => ({
  value,
  label,
}))

// A select clause as the picked values and whether it excludes them (`is not`, `is none of`).
const pickedValues = z.union([z.string(), z.array(z.string())]).catch([])

function picked(clause: FilterClause) {
  const [operator, value] = Object.entries(clause)[0] ?? []

  const values = [pickedValues.parse(value)].flat()

  return { values, negated: operator === '_neq' || operator === '_nin' }
}

function daysFromToday(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)

  return date.toLocaleDateString('en-CA')
}

function retentionClause(value: string): FilterClause | null {
  if (value === 'past') return { retainUntil: { _lt: todayInput() } }

  if (value !== 'soon') return null
  const after: FilterClause = { retainUntil: { _gte: todayInput() } }
  const before: FilterClause = { retainUntil: { _lte: daysFromToday(30) } }

  return { _and: [after, before] }
}

const filterFields: Array<ListFilterField> = [
  {
    id: 'source',
    label: copy.columns.source,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <CircleDot />,
    options: sourceOptions,
  },
  relationField({
    id: 'job',
    label: copy.filters.job,
    icon: <Briefcase />,
    placeholder: appCopy.form.searchPlaceholder(copy.filters.job),
    search: lookupRequisitions,
    resolve: resolveRequisitions,
    toClause: (clause) => ({ applications: { _some: { requisitionId: clause } } }),
  }),
  {
    id: 'stage',
    label: copy.filters.stage,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    icon: <Kanban />,
    loadOptions: lookupStageNames,
    resolveValues: (values) => values.map((value) => ({ value, label: value })),
    toClause: (clause) => ({
      applications: { _some: { status: 'active', interview_stages: { name: clause } } },
    }),
  },
  { id: 'tags', label: copy.filters.tag, type: 'text', icon: <Tag /> },
  {
    id: 'pool',
    label: copy.filters.pool,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is',
    searchable: false,
    icon: <UsersRound />,
    options: [
      { value: 'yes', label: copy.filters.inPool },
      { value: 'no', label: copy.filters.notInPool },
    ],
    toClause: (clause) => {
      const { values, negated } = picked(clause)

      return {
        inTalentPool: { [negated ? '_nin' : '_in']: values.map((value) => value === 'yes') },
      }
    },
  },
  {
    id: 'retention',
    label: copy.filters.retention,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is',
    searchable: false,
    icon: <ShieldAlert />,
    options: [
      { value: 'past', label: copy.filters.pastRetention },
      { value: 'soon', label: copy.filters.dueSoon },
    ],
    toClause: (clause) => {
      const { values, negated } = picked(clause)

      const clauses = values.flatMap((value): Array<FilterClause> => {
        const clause = retentionClause(value)

        return clause ? [clause] : []
      })

      const combined: FilterClause =
        clauses.length === 1 && clauses[0] ? clauses[0] : { _or: clauses }

      return negated ? { _not: combined } : combined
    },
  },
  dateField({
    id: 'updatedAt',
    label: copy.columns.lastActivity,
    icon: <CalendarDays />,
    defaultOperator: 'is_after',
  }),
]

const candidatesView = z.enum(['pool', 'retention'])

type CandidatesView = z.infer<typeof candidatesView>

const searchSchema = listSearchSchema.extend({
  view: candidatesView.optional().catch(undefined),
})

// The Talent pool and Past retention views are saved searches: a fixed clause on top of filters.
function viewClause(view: CandidatesView | undefined): CandidatesFilter | undefined {
  if (view === 'pool') return { inTalentPool: true }

  if (view === 'retention') return { retainUntil: { _lt: todayInput() } }

  return undefined
}

function clauseFor(query: ListFilterQuery | undefined, view: CandidatesView | undefined) {
  // SAFETY: filtersToClause only emits operators valid for each field type. The generated filter
  // schema can't check it yet (docs/monospace.md, known issues).
  const filter = filtersToClause(filterFields, query) as CandidatesFilter | undefined
  const scoped = viewClause(view)

  if (filter && scoped) return { _and: [scoped, filter] }

  return filter ?? scoped
}

export const Route = createFileRoute('/_app/ats/candidates')({
  staticData: {
    page: {
      title: copy.title,
      icon: CandidateIcon,
      module: 'ats',
      nav: 30,
      keywords: copy.keywords,
      fullWidth: true,
      fill: true,
    },
  },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    q: search.q,
    filter: clauseFor(search.filters, search.view),
    sort: parseSort(search.sort),
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient
      .infiniteQuery({ ...candidatesPagesQuery(deps), staleTime: 'static' })
      .catch(noop)
  },
  component: CandidatesPage,
})

function activeApplications(row: CandidateRow) {
  return row.applications.data.filter((application) => application.status === 'active')
}

function lastActivity(row: CandidateRow) {
  return row.applications.data.reduce(
    (latest, application) =>
      application.lastActivityAt && application.lastActivityAt > latest
        ? application.lastActivityAt
        : latest,
    row.updatedAt ?? '',
  )
}

function JobsCell({ row }: { row: CandidateRow }) {
  const active = activeApplications(row)
  const [first] = active

  if (!first) {
    return <span className="text-muted-foreground">{copy.noJobs}</span>
  }

  const others = active.slice(1)

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate">
        {first.requisitions?.title}
        <span className="text-muted-foreground"> · {first.interview_stages?.name}</span>
      </span>
      {others.length ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="shrink-0">
                <MultiJobBadge count={active.length} />
              </span>
            }
          />
          <TooltipContent className="space-y-0.5">
            {active.map((application) => (
              <p key={application.id}>
                {application.requisitions?.title} · {application.interview_stages?.name}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  )
}

const columns: Array<DataTableColumn<CandidateRow>> = [
  {
    id: 'name',
    header: copy.columns.name,
    accessorFn: (row) => candidateName(row),
    size: 260,
    enableHiding: false,
    cell: ({ row }) => <CandidateLabel candidate={row.original} secondary={row.original.email} />,
  },
  {
    id: 'jobs',
    header: copy.columns.jobs,
    enableSorting: false,
    size: 280,
    cell: ({ row }) => <JobsCell row={row.original} />,
  },
  {
    id: 'source',
    header: copy.columns.source,
    accessorFn: (row) => row.source ?? '',
    size: 170,
    cell: ({ row }) => sourceLabel(row.original),
  },
  {
    id: 'location',
    header: copy.columns.location,
    accessorFn: (row) => locationLabel(row),
    size: 170,
    cell: ({ row }) => locationLabel(row.original),
  },
  {
    id: 'tags',
    header: copy.columns.tags,
    enableSorting: false,
    size: 220,
    cell: ({ row }) => <TagList tags={row.original.tags} max={2} className="flex-nowrap" />,
  },
  {
    id: 'pool',
    header: copy.columns.pool,
    enableSorting: false,
    size: 120,
    cell: ({ row }) =>
      row.original.inTalentPool ? (
        <Badge variant="secondary">
          <TalentPoolIcon />
          {copy.inPool}
        </Badge>
      ) : null,
  },
  {
    id: 'lastActivity',
    header: copy.columns.lastActivity,
    accessorFn: (row) => lastActivity(row),
    size: 140,
    cell: ({ row }) => (
      <RelativeTime value={lastActivity(row.original)} className="text-muted-foreground" />
    ),
  },
  {
    id: 'consent',
    header: copy.columns.consent,
    accessorFn: (row) => row.consentAt ?? '',
    size: 160,
    cell: ({ row }) => <ConsentStatus consentAt={row.original.consentAt} />,
  },
  {
    id: 'retainUntil',
    header: copy.columns.retainUntil,
    accessorFn: (row) => row.retainUntil ?? '',
    size: 170,
    cell: ({ row }) =>
      isPastRetention(row.original.retainUntil) ? (
        <RetentionBadge retainUntil={row.original.retainUntil} />
      ) : (
        <span className="text-muted-foreground">{formatDate(row.original.retainUntil)}</span>
      ),
  },
]

function CandidateRowMobile({ candidate }: { candidate: CandidateRow }) {
  const active = activeApplications(candidate)
  const first = active[0]

  return (
    <DataTableMobileRow
      render={<Link to="/ats/candidates/$candidateId" params={{ candidateId: candidate.id }} />}
      leading={<CandidateAvatar candidate={candidate} />}
      title={candidateName(candidate)}
      meta={[
        first
          ? `${first.requisitions?.title ?? ''} · ${first.interview_stages?.name ?? ''}`
          : candidate.inTalentPool
            ? copy.inPool
            : copy.noJobs,
        locationLabel(candidate) || optionLabel('source', candidate.source),
      ]}
      trailing={
        isPastRetention(candidate.retainUntil) ? (
          <RetentionBadge retainUntil={candidate.retainUntil} />
        ) : active.length > 1 ? (
          <MultiJobBadge count={active.length} />
        ) : null
      }
    />
  )
}

const viewTabs: Array<{ value: CandidatesView | 'all'; label: string; icon: typeof UsersRound }> = [
  { value: 'all', label: copy.views.all, icon: CandidateIcon },
  { value: 'pool', label: copy.views.pool, icon: TalentPoolIcon },
  { value: 'retention', label: copy.views.pastRetention, icon: ShieldAlert },
]

function CandidatesPage() {
  const access = useCollectionAccess('candidates')
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const page = useListPage({
    id: 'ats-candidates',
    columns,
    search,
    onSearchChange: (patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) }),
    params: Route.useLoaderDeps(),
    query: candidatesPagesQuery,
    selectable: true,
  })

  const { list: candidates, selectedIds, clearSelection } = page

  const [adding, setAdding] = useState(false)

  const updateMany = useUpdateManyCandidates()

  return (
    <ListWorkspace
      title={copy.title}
      icon={CandidateIcon}
      controls={
        <ListControls
          state={page}
          fields={filterFields}
          title={copy.title}
          icon={CandidateIcon}
          defaultSort={{ id: 'lastActivity', desc: true, label: copy.columns.lastActivity }}
          selection={
            selectedIds.length ? (
              <ListBulkActions
                canUpdate={access.canUpdate}
                ids={selectedIds}
                noun={copy.title}
                singular={copy.singular}
                fields={[
                  {
                    name: 'inTalentPool',
                    label: copy.columns.pool,
                    kind: 'select',
                    options: [
                      { value: 'yes', label: copy.filters.inPool },
                      { value: 'no', label: copy.filters.notInPool },
                    ],
                  },
                  {
                    name: 'source',
                    label: copy.columns.source,
                    kind: 'select',
                    options: sourceOptions,
                  },
                  { name: 'retainUntil', label: copy.columns.retainUntil, kind: 'date' },
                ]}
                onClear={clearSelection}
                onUpdate={async (ids, { inTalentPool, ...patch }) => {
                  const data: candidatesUpdateOneInput = patch

                  if (inTalentPool) data.inTalentPool = inTalentPool === 'yes'
                  await updateMany.mutateAsync({ ids, data })
                }}
                deleting={false}
              />
            ) : undefined
          }
          action={
            access.create ? (
              <ListAddButton
                label={copy.form.title}
                icon={UserPlus}
                onClick={() => setAdding(true)}
              />
            ) : null
          }
        />
      }
    >
      <div className="flex flex-1 flex-col border-t md:min-h-0">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
          <Tabs
            value={search.view ?? 'all'}
            onValueChange={(next) => {
              const parsed = candidatesView.safeParse(next)

              void navigate({
                search: (previous) => ({
                  ...previous,
                  view: parsed.success ? parsed.data : undefined,
                }),
              })
            }}
          >
            <TabsList className="max-sm:overflow-x-auto max-sm:[scrollbar-width:none]">
              {viewTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                  <tab.icon
                    className={cn('size-3.5', tab.value === 'retention' && 'text-destructive')}
                  />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <ListTable
          query={candidates}
          {...page.tableProps}
          noun={copy.title}
          emptyMessage={search.view === 'pool' ? copy.empty.pool : copy.empty.title}
          mobileRow={(candidate) => <CandidateRowMobile candidate={candidate} />}
        />
      </div>
      <CandidateFormDrawer open={adding} onOpenChange={setAdding} />
    </ListWorkspace>
  )
}
