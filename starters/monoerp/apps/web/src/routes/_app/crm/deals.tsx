import { noop, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, CircleDot, Coins, Milestone } from 'lucide-react'

import { DataError, DataLoading } from '@/components/data-state'
import { DataTableMobileRow } from '@/components/data-table/data-table'
import type { DataTableColumn } from '@/components/data-table/data-table'
import { ListTable } from '@/components/data-table/list-table'
import { dateField } from '@/components/filters/filter-date-editor'
import { ListBulkActions, ownerBulkField } from '@/components/list-bulk-actions'
import { ListControls, ListAddButton } from '@/components/list-controls'
import { ListWorkspace } from '@/components/list-workspace'
import { Badge } from '@/components/ui/badge'
import { UserLabel } from '@/components/users'
import { useListPage } from '@/hooks/use-list-page'
import { appCopy } from '@/lib/app.copy'
import { filtersToClause, hasRuleFor, relationField } from '@/lib/filters'
import type { ListFilterField, ListFilterQuery } from '@/lib/filters'
import { formatDate, formatMoney } from '@/lib/format'
import { listSearchSchema, parseSort } from '@/lib/list-search'
import { useCollectionAccess } from '@/lib/permissions'
import { lookupUsers, resolveUsers } from '@/lib/users'
import { DealBoard } from '@/modules/crm/components/deal-board'
import { DealDrawer } from '@/modules/crm/components/deal-form'
import {
  ContactLabel,
  OrganizationAvatar,
  OrganizationLabel,
} from '@/modules/crm/components/entities'
import { StageDot } from '@/modules/crm/components/stage-dot'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import {
  lookupOrganizations,
  lookupStages,
  dealsPagesQuery,
  dealsQuery,
  pipelineStagesQuery,
  resolveOrganizations,
  resolveStages,
} from '@/modules/crm/data'
import type { DealsFilter, DealRow } from '@/modules/crm/data'
import { organizationName, dealStatusOptions } from '@/modules/crm/entities'
import { DealIcon, OrganizationIcon, OwnerIcon } from '@/modules/crm/icons'
import { useDeleteManyDeals, useUpdateManyDeals } from '@/modules/crm/mutations'
import { stageColor } from '@/modules/crm/stage-color'

const filterFields: Array<ListFilterField> = [
  {
    id: 'status',
    label: appCopy.common.status,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <CircleDot />,
    options: dealStatusOptions,
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

function clauseFor(query: ListFilterQuery | undefined) {
  // SAFETY: filtersToClause only emits operators valid for each field type. The generated filter
  // schema can't check it yet (docs/monospace.md, known issues).
  return filtersToClause(filterFields, query) as DealsFilter | undefined
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
  // The board reads every deal; the table reads pages. `params` is the query's own input, so the
  // loader and the page build the same key; `display` only picks which query.
  loaderDeps: ({ search }) => ({
    display: search.display ?? 'table',
    params: { q: search.q, filter: clauseFor(search.filters), sort: parseSort(search.sort) },
  }),
  loader: async ({ context: { queryClient }, deps: { display, params } }) => {
    const stages = { ...pipelineStagesQuery(), staleTime: 'static' } as const

    if (display === 'board') {
      await Promise.all([
        queryClient.query({ ...dealsQuery(params), staleTime: 'static' }),
        queryClient.query(stages),
      ])

      return
    }

    // Stage names fill in the table's bulk edit, not its first paint.
    void queryClient.query(stages).catch(noop)
    await queryClient.infiniteQuery({ ...dealsPagesQuery(params), staleTime: 'static' })
  },
  component: DealsPage,
})

const columns: Array<DataTableColumn<DealRow>> = [
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
    cell: ({ row }) => <OrganizationLabel organization={row.original.organization} size="sm" />,
  },
  {
    id: 'contact',
    header: crmCopy.contacts.singular,
    enableSorting: false,
    size: 200,
    cell: ({ row }) =>
      row.original.contact ? (
        <ContactLabel contact={row.original.contact} size="sm" secondary={null} />
      ) : null,
  },
  {
    id: 'stage',
    header: crmCopy.deals.stage,
    enableSorting: false,
    size: 160,
    cell: ({ row }) => {
      const stage = row.original.stage

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

function DealRowMobile({ deal }: { deal: DealRow }) {
  const stage = deal.stage

  return (
    <DataTableMobileRow
      render={deal.id ? <Link to="/crm/deals/$dealId" params={{ dealId: deal.id }} /> : undefined}
      title={deal.title ?? crmCopy.deals.restricted}
      meta={[
        deal.organization ? (
          <span key="organization" className="flex min-w-0 items-center gap-1.5">
            <OrganizationAvatar
              organization={deal.organization}
              size="sm"
              className="data-[size=sm]:size-4"
            />
            <span className="truncate">{organizationName(deal.organization)}</span>
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
  const access = useCollectionAccess('deals')
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const page = useListPage({
    id: 'deals',
    columns,
    search,
    onSearchChange: (patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) }),
    params: Route.useLoaderDeps().params,
    query: dealsPagesQuery,
    selectable: true,
    board: true,
  })

  const { list: pages, selectedIds, clearSelection } = page

  const all = useQuery({ ...dealsQuery(page.params), enabled: page.display === 'board' })
  const stages = useQuery(pipelineStagesQuery())
  const ownerFiltered = hasRuleFor(filterFields, page.query, 'owner')
  const { display } = page

  const updateMany = useUpdateManyDeals()
  const deleteMany = useDeleteManyDeals()

  const loading = display === 'board' && (all.isPending || stages.isPending)

  return (
    <ListWorkspace
      title={crmCopy.deals.title}
      icon={DealIcon}
      controls={
        <ListControls
          state={page}
          fields={filterFields}
          title={crmCopy.deals.title}
          icon={DealIcon}
          defaultSort={{ id: 'updatedAt', desc: true, label: appCopy.common.lastUpdated }}
          selection={
            selectedIds.length ? (
              <ListBulkActions
                canUpdate={access.canUpdate}
                ids={selectedIds}
                noun={crmCopy.deals.title}
                singular={crmCopy.deals.singular}
                fields={[
                  {
                    name: 'stageId',
                    label: crmCopy.deals.stage,
                    kind: 'select',
                    options: (stages.data ?? []).flatMap((stage, index) =>
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
                  ownerBulkField,
                ]}
                onClear={clearSelection}
                onUpdate={async (ids, data) => {
                  // The database keeps status in step with the stage: a closed stage means won
                  // or lost, anything else means open.
                  const stage = stages.data?.find((candidate) => candidate.id === data.stageId)

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
            access.create ? (
              <DealDrawer
                trigger={<ListAddButton label={appCopy.form.add(crmCopy.deals.singular)} />}
              />
            ) : null
          }
        />
      }
    >
      {loading ? <DataLoading className="max-md:mx-4" /> : null}
      {all.isError ? <DataError error={all.error} className="max-md:mx-4" /> : null}
      {stages.isError ? <DataError error={stages.error} className="max-md:mx-4" /> : null}
      {display === 'table' ? (
        <>
          <ListTable
            query={pages}
            {...page.tableProps}
            noun={crmCopy.deals.title}
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
