import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'
import { CollisionPriority } from '@dnd-kit/abstract'
import { move } from '@dnd-kit/helpers'
import { DragDropProvider, KeyboardSensor, PointerSensor, useDroppable } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRightLeft,
  CalendarClock,
  Clock,
  CornerUpLeft,
  FilePlus2,
  TriangleAlert,
  UserRound,
  UserX,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { RecordMenu } from '@/components/record-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollBar } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Uuid } from '@/generated/monospace'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatDue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import {
  CandidateAvatar,
  candidateName,
} from '@/modules/ats/components/candidates/candidate-labels'
import { OfferDrawer, OfferStatusChip } from '@/modules/ats/components/interviews/offer-drawer'
import { RecommendationBadge } from '@/modules/ats/components/interviews/recommendation'
import { StageKindDot, stageKindStyle } from '@/modules/ats/components/jobs/job-badges'
import { RejectDialog } from '@/modules/ats/components/jobs/reject-dialog'
import { daysSince, needsAttention } from '@/modules/ats/data/jobs'
import type { InterviewStage, PipelineApplication } from '@/modules/ats/data/jobs'
import { useMoveApplication } from '@/modules/ats/mutations/jobs'

const copy = atsCopy.jobs.pipeline

type Columns = Record<Uuid, Array<Uuid>>

export type PipelineScope = keyof typeof copy.scope

const SCOPES: Record<PipelineScope, ReadonlyArray<string>> = {
  open: ['active', 'hired'],
  rejected: ['rejected', 'withdrawn'],
  all: ['active', 'hired', 'rejected', 'withdrawn'],
}

// Same sensors as the deal board: a touch long-press can lift a card from its name link too.
const sensors = [
  PointerSensor.configure({
    preventActivation: (event, source) =>
      event.pointerType === 'touch' && event.target instanceof Element && event.target.closest('a')
        ? false
        : (PointerSensor.defaults.preventActivation?.(event, source) ?? false),
  }),
  KeyboardSensor,
]

function groupByStage(applications: Array<PipelineApplication>, stages: Array<InterviewStage>) {
  const columns: Columns = Object.fromEntries(stages.map((stage) => [stage.id, []]))

  for (const application of applications) {
    const stageId = application.interviewStageId

    if (stageId && columns[stageId]) columns[stageId].push(application.id)
  }

  return columns
}

function statusForStage(stage: InterviewStage) {
  return stage.kind === 'hired' ? 'hired' : 'active'
}

export function PipelineBoard({
  jobId,
  stages,
  applications,
  scope,
}: {
  jobId: Uuid
  stages: Array<InterviewStage>
  applications: Array<PipelineApplication>
  scope: PipelineScope
}) {
  const update = useMoveApplication(jobId)
  const navigate = useNavigate()
  const [now] = useState(() => Date.now())
  const [rejecting, setRejecting] = useState<PipelineApplication>()
  const [offering, setOffering] = useState<Uuid>()
  const visible = applications.filter((row) => SCOPES[scope].includes(row.status ?? 'active'))
  const byId = new Map<string, PipelineApplication>(visible.map((row) => [row.id, row]))
  const grouped = groupByStage(visible, stages)

  // Drag state sits on top of server data until fresh data arrives, as on the deal board.
  const [override, setOverride] = useState<Columns | null>(null)
  const [seen, setSeen] = useState(applications)
  const [seenScope, setSeenScope] = useState(scope)

  if (seen !== applications || seenScope !== scope) {
    setSeen(applications)
    setSeenScope(scope)
    setOverride(null)
  }

  const columns = override ?? grouped
  const [dragging, setDragging] = useState(false)
  // A drop ends with a click on the card under the pointer; don't treat it as "open profile".
  const droppedAt = useRef(0)
  const isMobile = useIsMobile()
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageNavRef = useRef<HTMLElement>(null)
  const [visibleStage, setVisibleStage] = useState<string | undefined>(stages[0]?.id)

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

  function jumpTo(stageId: string) {
    viewportRef.current
      ?.querySelector(`[data-stage="${stageId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }

  function moveTo(application: PipelineApplication, stage: InterviewStage) {
    if (stage.id === application.interviewStageId) return false
    update.mutate(
      { id: application.id, data: { interviewStageId: stage.id, status: statusForStage(stage) } },
      {
        onError: () => {
          setOverride(null)
          toast.error(copy.moveFailed)
        },
      },
    )

    return true
  }

  // `at` is the click's event timestamp, on the same clock as the drop's.
  function openProfile(application: PipelineApplication, at: number) {
    if (at - droppedAt.current < 300 || !application.candidates?.id) return
    void navigate({
      to: '/ats/candidates/$candidateId',
      params: { candidateId: application.candidates.id },
      search: { job: jobId },
    })
  }

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={() => setDragging(true)}
      onDragOver={(event) => {
        if (event.operation.source?.type !== 'application') return
        setOverride((current) => move(current ?? grouped, event))
      }}
      onDragEnd={(event) => {
        setDragging(false)
        droppedAt.current = event.nativeEvent?.timeStamp ?? 0

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

        if (event.canceled || !source || source.type !== 'application') {
          setOverride(null)

          return
        }

        const application = byId.get(String(source.id))

        const stage =
          application && stages.find((item) => columns[item.id]?.includes(application.id))

        if (!application || !stage || !moveTo(application, stage)) setOverride(null)
      }}
    >
      <nav
        ref={stageNavRef}
        aria-label={atsCopy.jobs.plan.title}
        className="flex shrink-0 gap-1.5 overflow-x-auto border-b px-4 py-2 [scrollbar-width:none] md:hidden"
      >
        {stages.map((stage) => (
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
            <StageKindDot kind={stage.kind} className="size-2" />
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
            'size-full max-md:snap-x max-md:snap-mandatory max-md:scroll-px-4',
            dragging && 'max-md:snap-none',
          )}
        >
          <ScrollAreaPrimitive.Content className="flex min-h-full w-max items-stretch gap-3 px-4 pt-2 pb-4 sm:px-6 md:gap-3">
            {stages.map((stage, index) => {
              const rows = (columns[stage.id] ?? []).flatMap((id) => {
                const row = byId.get(id)

                return row ? [row] : []
              })

              return (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  index={index}
                  applications={rows}
                  now={now}
                  onOpen={openProfile}
                  onOffer={(application) => setOffering(application.id)}
                  renderMenu={(application) => (
                    <CardMenu
                      application={application}
                      stages={stages}
                      onMove={(target) => moveTo(application, target)}
                      onReject={() => setRejecting(application)}
                      onReactivate={() =>
                        update.mutate(
                          {
                            id: application.id,
                            data: {
                              status: statusForStage(stage),
                              rejectionReason: null,
                            },
                          },
                          {
                            onSuccess: () =>
                              toast.success(
                                copy.reactivated(candidateName(application.candidates)),
                              ),
                          },
                        )
                      }
                    />
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
      {offering ? (
        <OfferDrawer
          key={offering}
          applicationId={offering}
          open
          onOpenChange={(open) => !open && setOffering(undefined)}
        />
      ) : null}
      <RejectDialog
        key={rejecting?.id}
        name={candidateName(rejecting?.candidates)}
        open={Boolean(rejecting)}
        onOpenChange={(open) => !open && setRejecting(undefined)}
        onReject={async (reason) => {
          if (!rejecting) return
          const name = candidateName(rejecting.candidates)

          await update.mutateAsync({
            id: rejecting.id,
            data: { status: 'rejected', rejectionReason: reason },
          })
          toast.success(atsCopy.jobs.reject.done(name))
        }}
      />
    </DragDropProvider>
  )
}

function CardMenu({
  application,
  stages,
  onMove,
  onReject,
  onReactivate,
}: {
  application: PipelineApplication
  stages: Array<InterviewStage>
  onMove: (stage: InterviewStage) => void
  onReject: () => void
  onReactivate: () => void
}) {
  const inactive = application.status === 'rejected' || application.status === 'withdrawn'

  return (
    <RecordMenu size="icon-sm" variant="ghost">
      {application.candidates?.id ? (
        <DropdownMenuItem
          render={
            <Link
              to="/ats/candidates/$candidateId"
              params={{ candidateId: application.candidates.id }}
              search={{ job: application.requisitionId ?? undefined }}
            />
          }
        >
          <UserRound />
          {copy.openProfile}
        </DropdownMenuItem>
      ) : null}
      {inactive ? (
        <DropdownMenuItem onClick={onReactivate}>
          <CornerUpLeft />
          {copy.reactivate}
        </DropdownMenuItem>
      ) : (
        <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRightLeft />
              {copy.moveTo}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {stages.map((target) => (
                <DropdownMenuItem
                  key={target.id}
                  disabled={target.id === application.interviewStageId}
                  onClick={() => onMove(target)}
                >
                  <StageKindDot kind={target.kind} />
                  {target.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onReject}>
            <UserX />
            {copy.reject}
          </DropdownMenuItem>
        </>
      )}
    </RecordMenu>
  )
}

function StageColumn({
  stage,
  index,
  applications,
  now,
  onOpen,
  onOffer,
  renderMenu,
}: {
  stage: InterviewStage
  index: number
  applications: Array<PipelineApplication>
  now: number
  onOpen: (application: PipelineApplication, at: number) => void
  onOffer: (application: PipelineApplication) => void
  renderMenu: (application: PipelineApplication) => ReactNode
}) {
  const { ref, isDropTarget } = useDroppable({
    id: stage.id,
    type: 'column',
    accept: 'application',
    collisionPriority: CollisionPriority.Low,
  })

  const attention = applications.filter((row) => needsAttention(row, stage, now)).length

  return (
    <section
      ref={ref}
      aria-label={stage.name ?? undefined}
      data-stage={stage.id}
      style={stageKindStyle(stage.kind)}
      className={cn(
        'flex w-[85vw] shrink-0 snap-start flex-col rounded-xl bg-muted/40 transition-[background-color,box-shadow] md:w-68',
        isDropTarget &&
          'bg-[color-mix(in_oklab,var(--stage)_8%,var(--muted))] ring-2 ring-(--stage)',
      )}
    >
      <header className="sticky top-0 z-10 space-y-1.5 rounded-t-xl bg-[color-mix(in_oklab,var(--muted)_92%,transparent)] px-3 pt-3 pb-2 backdrop-blur-sm">
        <div className="h-1 rounded-full bg-(--stage)" />
        <div className="flex h-5 items-center gap-2">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h2 className="truncate text-sm leading-5 font-semibold">{stage.name}</h2>
          </span>
          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-background px-1.5 text-xs leading-none font-medium tabular-nums shadow-xs">
            {applications.length}
          </span>
          {attention ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="ml-auto inline-flex h-5 shrink-0 items-center gap-1 text-xs leading-none font-medium text-amber-700 tabular-nums dark:text-amber-400" />
                }
              >
                <TriangleAlert className="size-3.5" />
                {attention}
              </TooltipTrigger>
              <TooltipContent>{copy.needsAttention}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {optionLabel('stageKind', stage.kind)}
          {stage.slaDays != null ? ` · ${atsCopy.jobs.plan.sla} ${stage.slaDays}d` : ''}
        </p>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
        {applications.map((application, cardIndex) => (
          <PipelineCard
            key={application.id}
            application={application}
            stage={stage}
            index={cardIndex}
            now={now}
            onOpen={(at) => onOpen(application, at)}
            onOffer={() => onOffer(application)}
          >
            {renderMenu(application)}
          </PipelineCard>
        ))}
        {applications.length === 0 ? (
          <p className="grid flex-1 place-items-center rounded-lg border border-dashed py-6 text-xs text-muted-foreground">
            {isDropTarget ? copy.dropHere : copy.empty}
          </p>
        ) : null}
      </div>
    </section>
  )
}

const POST_INTERVIEW_KINDS = new Set(['background_check', 'offer', 'hired'])

// The offer stage is a form, not an interview: the card shows where the offer is and opens it.
function OfferStep({ offer, onOpen }: { offer: PipelineApplication['offer']; onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t pt-2">
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {offer ? (
          <OfferStatusChip status={offer.status} />
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            {copy.noOffer}
          </Badge>
        )}
        {offer?.status === 'pending_approval' && offer.steps ? (
          <span className="tabular-nums">{copy.approvals(offer.approved, offer.steps)}</span>
        ) : null}
      </span>
      <Button
        size="sm"
        variant={offer ? 'outline' : 'default'}
        className="shrink-0"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
      >
        {offer ? null : <FilePlus2 data-icon="inline-start" />}
        {offer ? copy.viewOffer : copy.createOffer}
      </Button>
    </div>
  )
}

function PipelineCard({
  application,
  stage,
  index,
  now,
  onOpen,
  onOffer,
  children,
}: {
  application: PipelineApplication
  stage: InterviewStage
  index: number
  now: number
  onOpen: (at: number) => void
  onOffer: () => void
  children: ReactNode
}) {
  const inactive = application.status === 'rejected' || application.status === 'withdrawn'

  const { ref, isDragging } = useSortable({
    id: application.id,
    index,
    group: stage.id,
    type: 'application',
    accept: 'application',
    disabled: inactive,
  })

  const candidate = application.candidates
  const name = candidateName(candidate)
  const days = daysSince(application.stageEnteredAt, now)
  const flagged = needsAttention(application, stage, now)
  const overSla = !inactive && stage.slaDays != null && days > stage.slaDays
  // Past the debrief nothing is an interview: no scorecard verdict or next-interview cue.
  const interviewing = !POST_INTERVIEW_KINDS.has(stage.kind ?? '')

  return (
    <article
      ref={ref}
      onClick={(event) => onOpen(event.timeStamp)}
      className={cn(
        'group/card cursor-pointer space-y-2 rounded-lg bg-background p-2.5 shadow-xs ring-1 ring-foreground/5 transition-shadow hover:shadow-sm pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]',
        !inactive && 'active:cursor-grabbing',
        inactive && 'opacity-70',
        isDragging && 'opacity-60 shadow-md',
      )}
    >
      <div className="flex items-start gap-2">
        <CandidateAvatar candidate={candidate} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          {candidate?.id ? (
            <Link
              to="/ats/candidates/$candidateId"
              params={{ candidateId: candidate.id }}
              search={{ job: application.requisitionId ?? undefined }}
              onClick={(event) => event.stopPropagation()}
              className="block truncate text-sm leading-snug font-medium hover:underline"
            >
              {name}
            </Link>
          ) : (
            <p className="truncate text-sm leading-snug font-medium">{name}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {optionLabel('source', candidate?.source)}
          </p>
        </div>
        <div
          className="-mt-1 -mr-1 shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/card:opacity-100 [@media(hover:hover)]:group-hover/card:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
      {inactive ? (
        <p className="line-clamp-2 text-xs text-destructive">
          {application.rejectionReason
            ? copy.rejectedReason(application.rejectionReason)
            : optionLabel('applicationStatus', application.status)}
        </p>
      ) : null}
      <div className="flex min-h-5 flex-wrap items-center gap-1.5 text-xs">
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  'inline-flex h-5 items-center gap-1 leading-none text-muted-foreground tabular-nums',
                  overSla && 'font-medium text-amber-700 dark:text-amber-400',
                )}
              />
            }
          >
            <Clock className="size-3" />
            {copy.inStage(days)}
          </TooltipTrigger>
          <TooltipContent>
            {overSla && stage.slaDays != null
              ? copy.overSla(days, stage.slaDays)
              : `${copy.inStageLabel}: ${copy.inStage(days)}`}
          </TooltipContent>
        </Tooltip>
        {application.status === 'hired' ? (
          <Badge variant="success">{optionLabel('applicationStatus', 'hired')}</Badge>
        ) : null}
        {flagged ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge
                  variant="secondary"
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-400"
                />
              }
            >
              <TriangleAlert data-icon="inline-start" />
              {copy.needsAttention}
            </TooltipTrigger>
            <TooltipContent>
              {overSla && stage.slaDays != null
                ? copy.overSla(days, stage.slaDays)
                : copy.quiet(daysSince(application.lastActivityAt, now))}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {interviewing ? <RecommendationBadge value={application.latestRecommendation} /> : null}
      </div>
      {stage.kind === 'offer' && !inactive ? (
        <OfferStep offer={application.offer} onOpen={onOffer} />
      ) : null}
      {interviewing && application.nextInterviewAt ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock className="size-3" />
          {formatDue(application.nextInterviewAt, now)}
        </p>
      ) : null}
    </article>
  )
}
