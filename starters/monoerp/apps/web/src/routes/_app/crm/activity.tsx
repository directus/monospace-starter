import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CircleDot } from 'lucide-react'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import { useListSearch } from '@/hooks/use-list-page'
import { ListControls } from '@/components/list-controls'
import { DeleteDialog } from '@/components/confirm-dialog'
import { DataError, DataLoading } from '@/components/data-state'
import { ListWorkspace } from '@/components/list-workspace'
import { LoadMoreSentinel } from '@/components/data-table/load-more-sentinel'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { filtersToClause, relationField, withRule } from '@/lib/filters'
import type { ListFilterField, ListFilterQuery } from '@/lib/filters'
import { listSearchSchema } from '@/lib/list-search'
import { cn } from '@/lib/utils'
import { countBuckets, upcomingBuckets } from '@/modules/crm/activity'
import type { UpcomingBucket } from '@/modules/crm/activity'
import { ActivityDetailDrawer } from '@/modules/crm/components/activity-detail'
import type { ActivityDetailMode } from '@/modules/crm/components/activity-detail'
import { LogActivityButton, activityTypes } from '@/modules/crm/components/activity-form'
import { HistoryList } from '@/modules/crm/components/history-list'
import { ActivityBulkActions } from '@/modules/crm/components/activity-bulk'
import { TodoList } from '@/modules/crm/components/todo-list'
import type { RowHandlers } from '@/modules/crm/components/todo-list'
import { bucketLabels, bucketClause } from '@/modules/crm/activity'
import { crmCopy } from '@/modules/crm/crm.copy'
import { ActivityIcon, DealIcon, OrganizationIcon, OwnerIcon } from '@/modules/crm/icons'
import {
  activityPagesQuery,
  activityView,
  lookupOpportunities,
  lookupOrganizations,
  openDueDatesQuery,
  resolveOpportunities,
  resolveOrganizations,
} from '@/modules/crm/data'
import { lookupUsers, resolveUsers } from '@/lib/users'
import type { ActivityRecord, ActivityFilter, ActivityView } from '@/modules/crm/data'
import type { OwnerLike } from '@/lib/users'
import { useDeleteActivity } from '@/modules/crm/mutations'
import type { Uuid } from '@/generated/monospace'

const copy = crmCopy.activity

const filterFields: Array<ListFilterField> = [
  {
    id: 'type',
    label: copy.form.type,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <CircleDot />,
    options: activityTypes.map((item) => ({ value: item.value, label: item.label })),
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
  relationField({
    id: 'organization',
    label: crmCopy.organizations.singular,
    icon: <OrganizationIcon />,
    placeholder: appCopy.form.searchPlaceholder(crmCopy.organizations.title),
    search: lookupOrganizations,
    resolve: resolveOrganizations,
    path: 'organizationId',
  }),
  relationField({
    id: 'deal',
    label: crmCopy.deals.singular,
    icon: <DealIcon />,
    placeholder: appCopy.form.searchPlaceholder(crmCopy.deals.title),
    search: (q) => lookupOpportunities(q),
    resolve: resolveOpportunities,
    path: 'opportunityId',
  }),
]

const searchSchema = listSearchSchema.extend({
  view: activityView.optional().catch(undefined),
  due: z.enum(['overdue', 'today', 'week', 'later', 'noDate']).optional().catch(undefined),
})

function clauseFor({
  query,
  due,
  now,
}: {
  query: ListFilterQuery | undefined
  due?: UpcomingBucket
  now: number
}) {
  const clauses: Array<ActivityFilter> = []
  // SAFETY: filtersToClause only emits operators valid for each field type. The generated filter
  // schema can't check it yet (docs/monospace.md, known issues).
  const fromFilters = filtersToClause(filterFields, query) as ActivityFilter | undefined

  if (fromFilters) clauses.push(fromFilters)

  if (due) clauses.push(bucketClause(due, now))

  return clauses.length ? { _and: clauses } : undefined
}

export const Route = createFileRoute('/_app/crm/activity')({
  staticData: {
    page: {
      title: copy.title,
      icon: ActivityIcon,
      module: 'crm',
      nav: 50,
      fullWidth: true,
      fill: true,
    },
  },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    q: search.q,
    filters: search.filters,
    view: search.view ?? 'todo',
    due: search.due,
  }),
  loader: ({ context: { queryClient }, deps }) => {
    const now = Date.now()

    return Promise.all([
      queryClient.ensureInfiniteQueryData(
        activityPagesQuery({
          view: deps.view,
          q: deps.q,
          filter: clauseFor({
            query: deps.filters,
            due: deps.view === 'todo' ? deps.due : undefined,
            now,
          }),
        }),
      ),
      queryClient.ensureQueryData(
        openDueDatesQuery({ q: deps.q, filter: clauseFor({ query: deps.filters, now }) }),
      ),
    ])
  },
  component: ActivityPage,
})

function ActivityPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [now] = useState(() => Date.now())
  const view: ActivityView = search.view ?? 'todo'
  const due = view === 'todo' ? search.due : undefined

  const state = useListSearch({
    search,
    onSearchChange: (patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) }),
  })

  const query = state.query

  const pages = useInfiniteQuery(
    activityPagesQuery({ view, q: search.q, filter: clauseFor({ query, due, now }) }),
  )

  // Counts stay live on both tabs so the To do number never blinks out.
  const openDue = useQuery(openDueDatesQuery({ q: search.q, filter: clauseFor({ query, now }) }))
  const rows = useMemo(() => pages.data?.pages.flat() ?? [], [pages.data])
  const counts = useMemo(() => countBuckets(openDue.data ?? [], now), [openDue.data, now])
  const openCount = openDue.data?.length ?? 0

  const [selected, select] = useState<{ id: Uuid; mode: ActivityDetailMode } | null>(null)
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  // Phones get no bulk selection, same as the other CRM lists.
  const isMobile = useIsMobile()
  const [deleting, setDeleting] = useState<ActivityRecord>()
  const remove = useDeleteActivity()
  const selectedRow = rows.find((row) => row.id === selected?.id) ?? null

  // Drop selections for rows that left the list (completed, rescheduled out of the bucket).
  const checkedIds = useMemo(
    () => rows.flatMap((row) => (row.id && checked.has(row.id) ? [row.id] : [])),
    [rows, checked],
  )

  const set = (patch: Partial<typeof search>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }) })

  const setQuery = state.setFilters

  const filterOwner = (owner: OwnerLike) =>
    owner.id && setQuery(withRule(query, 'owner', 'is_any_of', [owner.id]))

  const handlers: RowHandlers = {
    onOpen: (row) => row.id && select({ id: row.id, mode: 'view' }),
    onEdit: (row) => row.id && select({ id: row.id, mode: 'edit' }),
    onDelete: (row) => {
      remove.reset()
      setDeleting(row)
    },
    onFilterOwner: filterOwner,
  }

  const footer = (
    <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
      {pages.isFetchingNextPage ? (
        <Spinner />
      ) : pages.hasNextPage ? (
        <LoadMoreSentinel enabled onVisible={() => void pages.fetchNextPage()} />
      ) : rows.length ? (
        appCopy.filters.allLoaded(rows.length, copy.plural)
      ) : null}
    </div>
  )

  return (
    <ListWorkspace
      title={copy.title}
      icon={ActivityIcon}
      controls={
        <ListControls
          state={state}
          fields={filterFields}
          title={copy.title}
          icon={ActivityIcon}
          selection={
            checkedIds.length && !isMobile ? (
              <ActivityBulkActions ids={checkedIds} onClear={() => setChecked(new Set())} />
            ) : undefined
          }
          action={<LogActivityButton />}
        />
      }
    >
      <div className="flex flex-1 flex-col border-t md:min-h-0">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3 max-sm:h-auto max-sm:flex-wrap max-sm:gap-y-1 max-sm:py-1.5 sm:px-4">
          <Tabs
            value={view}
            onValueChange={(next) => {
              const parsed = activityView.safeParse(next)

              if (parsed.success) void set({ view: parsed.data, due: undefined })
            }}
          >
            <TabsList>
              <TabsTrigger value="todo" className="gap-1.5">
                {copy.todo}
                <span className="text-xs text-muted-foreground tabular-nums">{openCount}</span>
              </TabsTrigger>
              <TabsTrigger value="history">{copy.history}</TabsTrigger>
            </TabsList>
          </Tabs>
          {view === 'todo' ? (
            <div className="flex [scrollbar-width:none] flex-wrap items-center gap-1 max-sm:-mx-3 max-sm:w-[calc(100%+1.5rem)] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-3">
              {upcomingBuckets
                .filter((bucket) => bucket !== 'noDate' || counts.noDate > 0)
                .map((bucket) => (
                  <BucketChip
                    key={bucket}
                    active={due === bucket}
                    label={bucketLabels[bucket]}
                    count={counts[bucket]}
                    alert={bucket === 'overdue' && counts.overdue > 0}
                    onClick={() => set({ due: due === bucket ? undefined : bucket })}
                  />
                ))}
            </div>
          ) : null}
        </div>
        <div className="relative flex-1 md:min-h-0 md:overflow-y-auto">
          {pages.isPending ? <DataLoading /> : null}
          {pages.isError ? <DataError error={pages.error} /> : null}
          {pages.data && view === 'todo' ? (
            rows.length ? (
              <TodoList
                rows={rows}
                bucket={due ?? 'all'}
                selected={isMobile ? undefined : checked}
                onSelectedChange={isMobile ? undefined : setChecked}
                handlers={handlers}
                footer={footer}
              />
            ) : (
              <EmptyState bucket={due ?? 'all'} counts={counts} />
            )
          ) : null}
          {pages.data && view === 'history' ? (
            rows.length ? (
              <HistoryList
                rows={rows}
                now={now}
                selected={isMobile ? undefined : checked}
                onSelectedChange={isMobile ? undefined : setChecked}
                handlers={handlers}
                footer={footer}
              />
            ) : (
              <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                {copy.emptyFiltered}
              </p>
            )
          ) : null}
        </div>
      </div>

      <ActivityDetailDrawer
        row={selectedRow}
        mode={selected?.mode ?? 'view'}
        onModeChange={(mode) => select((current) => (current ? { ...current, mode } : null))}
        onOpenChange={(isOpen) => !isOpen && select(null)}
        onDelete={handlers.onDelete}
      />
      <DeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        noun={copy.singular}
        name={deleting?.subject ?? copy.untitled}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() => {
          if (!deleting?.id) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(undefined)

              if (selected?.id === deleting.id) select(null)
            },
          })
        }}
      />
    </ListWorkspace>
  )
}

function BucketChip({
  active,
  label,
  count,
  alert = false,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  alert?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors hover:bg-muted pointer-coarse:h-9 pointer-coarse:px-2.5',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      <span className={cn('tabular-nums', alert ? 'text-destructive' : 'text-muted-foreground')}>
        {count}
      </span>
    </button>
  )
}

// Empty buckets say what's next instead of just "nothing here".
function EmptyState({
  bucket,
  counts,
}: {
  bucket: UpcomingBucket | 'all'
  counts: Record<UpcomingBucket, number>
}) {
  const next = upcomingBuckets.find(
    (candidate) => candidate !== 'noDate' && candidate !== bucket && counts[candidate] > 0,
  )

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="text-sm font-medium">{copy.bucketEmpty[bucket]}</p>
      {next ? (
        <p className="text-sm text-muted-foreground">
          {copy.nextUp(counts[next], bucketLabels[next])}
        </p>
      ) : null}
    </div>
  )
}
