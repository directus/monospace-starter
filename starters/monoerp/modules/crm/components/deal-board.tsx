import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'
import { CollisionPriority } from '@dnd-kit/abstract'
import { move } from '@dnd-kit/helpers'
import { DragDropProvider, KeyboardSensor, PointerSensor, useDroppable } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { Link } from '@tanstack/react-router'
import { ArrowRightLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { DeleteDialog } from '@/components/confirm-dialog'
import { Empty } from '@/components/panel'
import { RecordMenu } from '@/components/record-menu'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollBar } from '@/components/ui/scroll-area'
import { UserLabel } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatMoney } from '@/lib/format'
import { useCollectionAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { CloseDealDialog } from '@/modules/crm/components/close-deal-dialog'
import { OrganizationLabel } from '@/modules/crm/components/entities'
import { StageDot } from '@/modules/crm/components/stage-dot'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { DealRow, PipelineStage } from '@/modules/crm/data'
import { statusForStage, totalsByCurrency } from '@/modules/crm/deals'
import { organizationName } from '@/modules/crm/entities'
import { useCloseDeal, useDeleteDeal, useUpdateDeal } from '@/modules/crm/mutations'
import { stageStyle } from '@/modules/crm/stage-color'

type Columns = Record<Uuid, Array<Uuid>>

// The default sensor won't start a drag on links. Let a touch long-press lift the card from its
// title too; mouse keeps the default so desktop links behave as before.
const sensors = [
  PointerSensor.configure({
    preventActivation: (event, source) =>
      event.pointerType === 'touch' && event.target instanceof Element && event.target.closest('a')
        ? false
        : (PointerSensor.defaults.preventActivation?.(event, source) ?? false),
  }),
  KeyboardSensor,
]

function groupByStage(deals: Array<DealRow>, stages: Array<PipelineStage>): Columns {
  const columns: Columns = Object.fromEntries(stages.map((stage) => [stage.id, []]))

  for (const deal of deals) {
    const stageId = deal.stage?.id

    if (stageId && columns[stageId]) columns[stageId].push(deal.id)
  }

  return columns
}

export function DealBoard({
  deals,
  stages,
  showOwner = true,
}: {
  deals: Array<DealRow>
  stages: Array<PipelineStage>
  showOwner?: boolean
}) {
  const update = useUpdateDeal()
  const close = useCloseDeal()
  const access = useCollectionAccess('deals')
  const canMove = access.canUpdate('stageId') && access.canUpdate('status')
  const [closing, setClosing] = useState<{ deal: DealRow; stage: PipelineStage }>()
  const remove = useDeleteDeal()
  const [deleting, setDeleting] = useState<DealRow>()
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]))
  const grouped = groupByStage(deals, stages)

  // Drag state is an override on top of server data. Fresh data wins as soon as it arrives.
  const [override, setOverride] = useState<Columns | null>(null)
  const [seenDeals, setSeenDeals] = useState(deals)

  if (seenDeals !== deals) {
    setSeenDeals(deals)
    setOverride(null)
  }

  const columns = override ?? grouped
  // Scroll snapping fights dnd-kit's edge auto-scroll, so it's off while a card is lifted.
  const [dragging, setDragging] = useState(false)
  const isMobile = useIsMobile()
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageNavRef = useRef<HTMLElement>(null)
  const [visibleStage, setVisibleStage] = useState<string | undefined>(stages[0]?.id ?? undefined)

  function nearestColumn() {
    const viewport = viewportRef.current

    if (!viewport) return undefined
    const distance = (section: HTMLElement) => Math.abs(section.offsetLeft - viewport.scrollLeft)

    return [...viewport.querySelectorAll<HTMLElement>('[data-stage]')].reduce<
      HTMLElement | undefined
    >((best, section) => (!best || distance(section) < distance(best) ? section : best), undefined)
  }

  function onBoardScroll() {
    if (!isMobile) return
    const stageId = nearestColumn()?.dataset.stage

    if (stageId === visibleStage) return
    setVisibleStage(stageId)
    stageNavRef.current
      ?.querySelector(`[data-stage-chip="${stageId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }

  function moveTo(deal: DealRow, stage: PipelineStage) {
    if (!canMove || stage.id === deal.stage?.id) return

    if (stage.isClosed || stage.isWon) {
      close.reset()
      setOverride(null)
      setClosing({ deal, stage })

      return
    }

    update.mutate({ id: deal.id, data: { stageId: stage.id, status: statusForStage(stage) } })
  }

  function jumpTo(stageId: string) {
    viewportRef.current
      ?.querySelector(`[data-stage="${stageId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={() => setDragging(true)}
      onDragOver={(event) => {
        if (!canMove || event.operation.source?.type !== 'deal') return
        setOverride((current) => move(current ?? grouped, event))
      }}
      onDragEnd={(event) => {
        setDragging(false)

        // Turning snap back on doesn't re-snap, so settle on the column the drag ended over.
        if (isMobile) {
          requestAnimationFrame(() =>
            nearestColumn()?.scrollIntoView({
              behavior: 'smooth',
              inline: 'start',
              block: 'nearest',
            }),
          )
        }

        const { source } = event.operation

        if (!canMove || event.canceled || !source || source.type !== 'deal') {
          setOverride(null)

          return
        }

        const deal = deals.find((item) => item.id === source.id)

        const stage = deal && stages.find((item) => columns[item.id]?.includes(deal.id))

        if (!deal || !stage || stage.id === deal.stage?.id) {
          setOverride(null)

          return
        }

        if (stage.isClosed || stage.isWon) {
          moveTo(deal, stage)

          return
        }

        update.mutate(
          { id: deal.id, data: { stageId: stage.id, status: statusForStage(stage) } },
          {
            onError: () => {
              setOverride(null)
              toast.error(crmCopy.deals.board.moveFailed)
            },
          },
        )
      }}
    >
      <nav
        ref={stageNavRef}
        aria-label={crmCopy.deals.stage}
        className="flex shrink-0 gap-1.5 overflow-x-auto border-b px-2 py-2 [scrollbar-width:none] md:hidden"
      >
        {stages.map((stage, stageIndex) => (
          <button
            key={stage.id}
            type="button"
            data-stage-chip={stage.id}
            aria-current={stage.id === visibleStage ? 'true' : undefined}
            onClick={() => jumpTo(stage.id)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs whitespace-nowrap text-muted-foreground',
              stage.id === visibleStage && 'bg-muted font-medium text-foreground',
            )}
          >
            <StageDot stage={stage} index={stageIndex} />
            {stage.name}
            <span className="tabular-nums">{columns[stage.id]?.length ?? 0}</span>
          </button>
        ))}
      </nav>
      <ScrollAreaPrimitive.Root className="relative min-h-0 flex-1">
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          onScroll={onBoardScroll}
          className={cn(
            'size-full max-md:snap-x max-md:snap-mandatory max-md:scroll-px-2',
            dragging && 'max-md:snap-none',
          )}
        >
          <ScrollAreaPrimitive.Content className="flex min-h-full w-max items-stretch gap-3 p-2 pb-4 md:gap-4">
            {stages.map((stage, stageIndex) => {
              const stageId = stage.id
              const ids = columns[stageId] ?? []

              const rows = ids.flatMap((id) => {
                const deal = dealsById.get(id)

                return deal ? [deal] : []
              })

              return (
                <BoardColumn
                  key={stageId}
                  stage={stage}
                  index={stageIndex}
                  deals={rows}
                  showOwner={showOwner}
                  renderMenu={(deal) => (
                    <RecordMenu
                      size="icon-sm"
                      onDelete={
                        access.delete
                          ? () => {
                              remove.reset()
                              setDeleting(deal)
                            }
                          : undefined
                      }
                    >
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <ArrowRightLeft />
                          {crmCopy.deals.board.moveTo}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {stages.map((target) => (
                            <DropdownMenuItem
                              key={target.id}
                              disabled={!canMove || target.id === deal.stage?.id}
                              onClick={() => moveTo(deal, target)}
                            >
                              <StageDot stage={target} />
                              {target.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </RecordMenu>
                  )}
                />
              )
            })}
          </ScrollAreaPrimitive.Content>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
      {closing ? (
        <CloseDealDialog
          key={`${closing.deal.id}:${closing.stage.id}`}
          stage={closing.stage}
          valueAmount={closing.deal.valueAmount}
          currency={closing.deal.currency ?? 'USD'}
          expectedCloseDate={closing.deal.expectedCloseDate}
          pending={close.isPending}
          error={close.isError ? errorMessage(close.error) : undefined}
          onOpenChange={(open) => !open && setClosing(undefined)}
          onConfirm={async (values) => {
            await close.mutateAsync({
              ...values,
              id: closing.deal.id,
              stage: closing.stage,
              organizationId: closing.deal.organization?.id,
              currency: closing.deal.currency ?? 'USD',
            })
            setClosing(undefined)
          }}
        />
      ) : null}
      <DeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        noun={crmCopy.deals.singular}
        name={deleting?.title ?? crmCopy.deals.restricted}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() => {
          if (!deleting?.id) return
          remove.mutate(deleting.id, { onSuccess: () => setDeleting(undefined) })
        }}
      />
    </DragDropProvider>
  )
}

function BoardColumn({
  stage,
  index,
  deals,
  showOwner,
  renderMenu,
}: {
  stage: PipelineStage
  index: number
  deals: Array<DealRow>
  showOwner: boolean
  renderMenu: (deal: DealRow) => ReactNode
}) {
  const stageId = stage.id

  const { ref, isDropTarget } = useDroppable({
    id: stageId,
    type: 'column',
    accept: 'deal',
    collisionPriority: CollisionPriority.Low,
  })

  const totals = totalsByCurrency(deals)

  return (
    <section
      ref={ref}
      aria-label={stage.name ?? undefined}
      data-stage={stageId}
      style={stageStyle(stage, index)}
      className={cn(
        'flex w-[85vw] shrink-0 snap-start flex-col rounded-xl bg-muted/40 transition-[background-color,box-shadow] md:w-72',
        isDropTarget &&
          'bg-[color-mix(in_oklab,var(--stage)_8%,var(--muted))] ring-2 ring-(--stage)',
      )}
    >
      <header className="sticky top-0 z-10 space-y-1.5 rounded-t-xl bg-[color-mix(in_oklab,var(--muted)_92%,transparent)] px-3 pt-3 pb-2 backdrop-blur-sm">
        <div className="h-1 rounded-full bg-(--stage)" />
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">· {deals.length}</span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {totals.map(({ currency, total }) => (
              <span key={currency} className="block text-right">
                {formatMoney(String(total), currency)}{' '}
                <span className="text-[10px]">{currency}</span>
              </span>
            ))}
          </span>
        </div>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
        {deals.map((deal, index) => (
          <BoardCard
            key={deal.id}
            deal={deal}
            index={index}
            stageId={stageId}
            showOwner={showOwner}
          >
            {renderMenu(deal)}
          </BoardCard>
        ))}
        {deals.length === 0 ? (
          <Empty className="flex-1 rounded-lg text-xs">{crmCopy.deals.board.empty}</Empty>
        ) : null}
      </div>
    </section>
  )
}

function BoardCard({
  deal,
  index,
  stageId,
  showOwner,
  children,
}: {
  deal: DealRow
  index: number
  stageId: string
  showOwner: boolean
  children: ReactNode
}) {
  const access = useCollectionAccess('deals')

  const { ref, isDragging } = useSortable({
    id: deal.id,
    index,
    group: stageId,
    type: 'deal',
    accept: 'deal',
    disabled: !access.canUpdate('stageId') || !access.canUpdate('status'),
  })

  return (
    <article
      ref={ref}
      className={cn(
        'group/card cursor-grab space-y-1.5 rounded-lg bg-background p-2.5 shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]',
        isDragging && 'opacity-60 shadow-md',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {deal.id ? (
            <Link
              to="/crm/deals/$dealId"
              params={{ dealId: deal.id }}
              className="text-sm leading-snug font-medium hover:underline"
            >
              {deal.title ?? crmCopy.deals.restricted}
            </Link>
          ) : (
            <p className="text-sm leading-snug font-medium">
              {deal.title ?? crmCopy.deals.restricted}
            </p>
          )}
        </div>
        <div
          className="-mt-1 -mr-1 shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/card:opacity-100 [@media(hover:hover)]:group-hover/card:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
      {deal.organization?.domain ? (
        <OrganizationLabel
          organization={deal.organization}
          size="sm"
          link={false}
          className="text-muted-foreground"
        />
      ) : (
        <p className="truncate text-sm text-muted-foreground">
          {organizationName(deal.organization)}
        </p>
      )}
      <div className="flex min-h-6 items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground tabular-nums">
          {deal.valueAmount != null ? (
            <span className="font-medium text-foreground">
              {formatMoney(deal.valueAmount, deal.currency ?? undefined)}
            </span>
          ) : null}
          {deal.valueAmount != null && deal.expectedCloseDate ? <span aria-hidden>·</span> : null}
          {deal.expectedCloseDate ? <span>{formatDate(deal.expectedCloseDate)}</span> : null}
        </span>
        {showOwner ? (
          <UserLabel
            user={deal.owner}
            size="sm"
            className="max-w-24 gap-1.5 text-muted-foreground [&>span:last-child]:text-xs"
          />
        ) : null}
      </div>
    </article>
  )
}
