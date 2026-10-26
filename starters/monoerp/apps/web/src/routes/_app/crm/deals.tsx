import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, CircleDot, Coins, Milestone, Plus } from 'lucide-react'
import { useMemo } from 'react'

import { DataTable, DataTableMobileRow, useDataTable } from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { DataError, DataLoading } from '@/components/data-state'
import { ListBulkActions } from '@/components/list-bulk-actions'
import { DisplayMenu } from '@/components/display-menu'
import { useDeleteManyDeals, useUpdateManyDeals } from '@/modules/crm/mutations'
import { dateField } from '@/components/filter-date-editor'
import { FilterTrigger, FilterWell, ListFilters } from '@/components/list-filters'
import { ListToolbar } from '@/components/list-toolbar'
import { ListWorkspace } from '@/components/list-workspace'
import { createFilterQuery, isFilterQueryEmpty } from '@/components/reui/filters/filters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { appCopy } from '@/lib/app.copy'
import { filtersToClause, hasRuleFor, relationField } from '@/lib/filters'
import type { FilterValue, ListFilterField, ListFilterQuery } from '@/lib/filters'
import { formatDate, formatMoney } from '@/lib/format'
import { listSearchSchema, parseSort, serializeSort } from '@/lib/list-search'
import { DealBoard } from '@/modules/crm/components/deal-board'
import { DealDrawer } from '@/modules/crm/components/deal-form'
import {
  ContactLabel,
  OrganizationAvatar,
  OrganizationLabel,
  organizationName,
} from '@/modules/crm/components/entities'
import { UserLabel } from '@/components/users'
import { StageDot } from '@/modules/crm/components/stage-dot'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import { DealIcon, OrganizationIcon, OwnerIcon } from '@/modules/crm/icons'
import {
  lookupOrganizations,
  lookupStages,
  opportunitiesPagesQuery,
  opportunitiesQuery,
  pipelineStagesQuery,
  resolveOrganizations,
  resolveStages,
} from '@/modules/crm/data'
import { lookupUsers, resolveUsers } from '@/lib/user-options'
import type { OpportunitiesFilter, OpportunityRow } from '@/modules/crm/data'
import { stageColor } from '@/modules/crm/stage-color'
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
    options: Object.entries(crmCopy.deals.statuses).map(([value, label]) => ({ value, label })),
  },
  relationField({
    id: 'stage',
    label: crmCopy.deals.stage,
    icon: <Milestone />,
    placeholder: appCopy.form.searchPlaceholder(crmCopy.deals.stage),
    search: lookupStages,
    resolve: resolveStages,
    path: 'stageId',
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
    id: 'owner',
    label: appCopy.common.owner,
    icon: <OwnerIcon />,
    placeholder: appCopy.form.searchPlaceholder(appCopy.common.owner),
    search: lookupUsers,
    resolve: resolveUsers,
    path: 'ownerUserId',
  }),
  {
    id: 'value',
    label: crmCopy.deals.value,
    type: 'number',
    kind: 'number',
    icon: <Coins />,
    path: 'valueAmount',
  },
  dateField({
    id: 'closeDate',
    label: crmCopy.deals.expectedClose,
    icon: <CalendarDays />,
    path: 'expectedCloseDate',
    defaultOperator: 'between',
  }),
]

const EMPTY_QUERY = createFilterQuery<FilterValue>([])

function clauseFor(query: ListFilterQuery | undefined) {
  // SAFETY: filtersToClause only emits operators valid for each field type. The generated filter
  // schema can't check it yet (docs/monospace.md, known issues).
  return filtersToClause(filterFields, query) as OpportunitiesFilter | undefined
}

export const Route = createFileRoute('/_app/crm/deals')({
  staticData: {
    page: {
      title: crmCopy.deals.title,
      icon: DealIcon,
      module: 'crm',
      nav: 40,
      keywords: crmCopy.deals.keywords,
      fullWidth: true,
      fill: true,
    },
  },
  validateSearch: listSearchSchema,
  loaderDeps: ({ search }) => ({
    q: search.q,
    filter: clauseFor(search.filters),
    sort: parseSort(search.sort),
    display: search.display ?? 'table',
  }),
  loader: ({ context: { queryClient }, deps: { display, ...deps } }) =>
    display === 'board'
      ? queryClient.ensureQueryData(opportunitiesQuery(deps))
      : queryClient.ensureInfiniteQueryData(opportunitiesPagesQuery(deps)),
  component: DealsPage,
})

const columns: Array<DataTableColumn<OpportunityRow>> = [
  {
    id: 'title',
    header: crmCopy.deals.singular,
    accessorFn: (row) => row.title ?? '',
    size: 300,
    enableHiding: false,
    cell: ({ row }) =>
      row.original.id ? (
        <Link
          to="/crm/deals/$dealId"
          params={{ dealId: row.original.id }}
          className="font-medium hover:underline"
        >
          {row.original.title ?? crmCopy.deals.restricted}
        </Link>
      ) : (
        <span className="font-medium">{row.original.title ?? crmCopy.deals.restricted}</span>
      ),
  },
  {
    id: 'organization',
    header: crmCopy.organizations.singular,
    enableSorting: false,
    size: 220,
    cell: ({ row }) => <OrganizationLabel organization={row.original.organizations} size="sm" />,
  },
  {
    id: 'contact',
    header: crmCopy.contacts.singular,
    enableSorting: false,
    size: 200,
    cell: ({ row }) =>
      row.original.contacts ? (
        <ContactLabel contact={row.original.contacts} size="sm" secondary={null} />
      ) : null,
  },
  {
    id: 'stage',
    header: crmCopy.deals.stage,
    enableSorting: false,
    size: 160,
    cell: ({ row }) => {
      const stage = row.original.pipeline_stages

      return (
        <Badge variant="secondary" className="gap-1.5">
          {stage ? <StageDot stage={stage} /> : null}
          {stage?.name ?? crmCopy.deals.restrictedStage}
        </Badge>
      )
    },
  },
  {
    id: 'status',
    header: appCopy.common.status,
    accessorFn: (row) => row.status ?? '',
    size: 120,
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
    id: 'value',
    header: crmCopy.deals.value,
    accessorFn: (row) => row.valueAmount ?? '',
    size: 140,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right font-medium tabular-nums' },
    cell: ({ row }) => formatMoney(row.original.valueAmount, row.original.currency ?? undefined),
  },
  {
    id: 'closeDate',
    header: crmCopy.deals.expectedClose,
    accessorFn: (row) => row.expectedCloseDate ?? '',
    size: 150,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right text-muted-foreground' },
    cell: ({ row }) => formatDate(row.original.expectedCloseDate),
  },
]

function DealRowMobile({ deal }: { deal: OpportunityRow }) {
  const stage = deal.pipeline_stages

  return (
    <DataTableMobileRow
      render={deal.id ? <Link to="/crm/deals/$dealId" params={{ dealId: deal.id }} /> : undefined}
      title={deal.title ?? crmCopy.deals.restricted}
      meta={[
        deal.organizations ? (
          <span key="organization" className="flex min-w-0 items-center gap-1.5">
            <OrganizationAvatar
              organization={deal.organizations}
              size="sm"
              className="data-[size=sm]:size-4"
            />
            <span className="truncate">{organizationName(deal.organizations)}</span>
          </span>
        ) : null,
        <span key="stage" className="flex min-w-0 items-center gap-1.5">
          {stage ? <StageDot stage={stage} className="size-2" /> : null}
          <span className="truncate">{stage?.name ?? crmCopy.deals.restrictedStage}</span>
        </span>,
      ]}
      trailing={
        <span className="font-medium tabular-nums">
          {formatMoney(deal.valueAmount, deal.currency ?? undefined)}
        </span>
      }
    />
  )
}

function DealsPage() {
  const access = useCollectionAccess('opportunities')
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const display = search.display ?? 'table'
  const query = search.filters ?? EMPTY_QUERY
  const sort = parseSort(search.sort)
  const filter = clauseFor(query)

  const pages = useInfiniteQuery({
    ...opportunitiesPagesQuery({ q: search.q, filter, sort }),
    enabled: display === 'table',
  })

  const all = useQuery({
    ...opportunitiesQuery({ q: search.q, filter, sort }),
    enabled: display === 'board',
  })

  const stages = useQuery({ ...pipelineStagesQuery(), enabled: display === 'board' })
  const rows = useMemo(() => pages.data?.pages.flat() ?? [], [pages.data])
  const ownerFiltered = hasRuleFor(filterFields, query, 'owner')

  const { table, resetLayout, isDefaultLayout, onDragEnd, selectedIds, clearSelection } =
    useDataTable({
      id: 'deals',
      columns,
      rows,
      getRowId: (row) => row.id,
      sort,
      onSortChange: (next) =>
        navigate({ search: (previous) => ({ ...previous, sort: serializeSort(next) }) }),
      selectable: true,
      selectionKey: JSON.stringify([search.q, search.filters, search.sort]),
    })

  const updateMany = useUpdateManyDeals()
  const deleteMany = useDeleteManyDeals()
  const allStages = useQuery(pipelineStagesQuery())

  const loading = display === 'board' ? all.isPending || stages.isPending : pages.isPending

  return (
    <ListWorkspace
      title={crmCopy.deals.title}
      icon={DealIcon}
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
            title={crmCopy.deals.title}
            icon={DealIcon}
            query={search.q ?? ''}
            onQueryChange={(q) => navigate({ search: (previous) => ({ ...previous, q }) })}
            selection={
              selectedIds.length ? (
                <ListBulkActions
                  ids={selectedIds}
                  noun={crmCopy.deals.title}
                  singular={crmCopy.deals.singular}
                  fields={[
                    {
                      name: 'stageId',
                      label: crmCopy.deals.stage,
                      kind: 'select',
                      options: (allStages.data ?? []).flatMap((stage, index) =>
                        stage.id && stage.name
                          ? [
                              {
                                value: stage.id,
                                label: stage.name,
                                color: stageColor(stage, index),
                              },
                            ]
                          : [],
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
                    // The database keeps status in step with the stage: a closed stage means won
                    // or lost, anything else means open.
                    const stage = allStages.data?.find((candidate) => candidate.id === data.stageId)

                    const status = stage
                      ? stage.isClosed
                        ? stage.isWon
                          ? 'won'
                          : 'lost'
                        : 'open'
                      : undefined

                    await updateMany.mutateAsync({
                      ids,
                      data: status ? { ...data, status } : data,
                    })
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
                  display={display}
                  onDisplayChange={(nextDisplay) =>
                    navigate({ search: (previous) => ({ ...previous, display: nextDisplay }) })
                  }
                  sort={sort}
                  defaultSort={{ id: 'updatedAt', desc: true, label: appCopy.common.lastUpdated }}
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
                  <DealDrawer
                    trigger={
                      <Button className="max-md:ml-auto max-md:w-10 max-md:px-0!">
                        <Plus data-icon="inline-start" />
                        <span className="max-md:sr-only">
                          {appCopy.form.add(crmCopy.deals.singular)}
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
      {loading ? <DataLoading className="max-md:mx-4" /> : null}
      {pages.isError ? <DataError error={pages.error} className="max-md:mx-4" /> : null}
      {all.isError ? <DataError error={all.error} className="max-md:mx-4" /> : null}
      {stages.isError ? <DataError error={stages.error} className="max-md:mx-4" /> : null}
      {pages.data && display === 'table' ? (
        <>
          <DataTable
            table={table}
            onDragEnd={onDragEnd}
            noun={crmCopy.deals.title}
            hasMore={pages.hasNextPage}
            isLoadingMore={pages.isFetchingNextPage}
            onLoadMore={() => void pages.fetchNextPage()}
            mobileRow={(deal) => <DealRowMobile deal={deal} />}
          />
        </>
      ) : null}
      {all.data && stages.data && display === 'board' ? (
        <DealBoard deals={all.data} stages={stages.data} showOwner={!ownerFiltered} />
      ) : null}
    </ListWorkspace>
  )
}
