import { useCollectionAccess } from '@/lib/permissions'
import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { PipelineStage } from '@/modules/crm/data'
import { stageStyle } from '@/modules/crm/stage-color'
import type { Uuid } from '@/generated/monospace'

// Chevron pipeline of the open stages under a deal header. Only the current stage carries color;
// earlier stages are neutral and checked, later ones are muted. Click a stage to move the deal.
// When the deal is closed, the outcome sits at the end of the rail in its own color.
const chevron = {
  first: 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)',
  middle: 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)',
  last: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)',
}

export function StageStepper({
  stages,
  currentStageId,
  pendingStageId,
  onSelect,
}: {
  stages: Array<PipelineStage>
  currentStageId: Uuid | null | undefined
  pendingStageId?: Uuid
  onSelect: (stage: PipelineStage) => void
}) {
  const open = stages.filter((stage) => !stage.isClosed)
  const access = useCollectionAccess('opportunities')
  const canMove = access.canUpdate('stageId') && access.canUpdate('status')
  const current = stages.find((stage) => stage.id === currentStageId)
  const outcome = current?.isClosed ? current : undefined
  const currentIndex = open.findIndex((stage) => stage.id === currentStageId)
  const busy = Boolean(pendingStageId)
  const segments = outcome ? [...open, outcome] : open
  const railRef = useRef<HTMLOListElement>(null)

  // On a phone the rail scrolls sideways; keep the current stage in view. Setting scrollLeft
  // directly (not scrollIntoView) so the page itself never scrolls.
  useEffect(() => {
    const rail = railRef.current
    const active = rail?.querySelector<HTMLElement>('[aria-current="step"]')

    if (!rail || !active || rail.scrollWidth <= rail.clientWidth) return
    const item = active.parentElement ?? active
    rail.scrollLeft = item.offsetLeft - (rail.clientWidth - item.offsetWidth) / 2
  }, [currentStageId, segments.length])

  return (
    <ol
      ref={railRef}
      aria-label={crmCopy.deals.stepper.label}
      className="relative flex min-w-0 max-sm:[scrollbar-width:none] max-sm:overflow-x-auto"
    >
      {segments.map((stage, index) => {
        const isOutcome = stage === outcome
        const isCurrent = stage.id === currentStageId

        const isPast =
          !isOutcome && (Boolean(outcome) || (currentIndex >= 0 && index < currentIndex))

        const isPending = stage.id === pendingStageId

        const clipPath =
          index === 0
            ? chevron.first
            : index === segments.length - 1
              ? chevron.last
              : chevron.middle

        return (
          <li
            key={stage.id}
            className={cn('min-w-0 flex-1 max-sm:min-w-36', index > 0 && '-ml-2.5')}
            style={{ ...stageStyle(stage, index), zIndex: segments.length - index }}
          >
            <button
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              title={isCurrent ? undefined : crmCopy.deals.stepper.moveTo(stage.name ?? '')}
              disabled={!canMove || isCurrent || busy || isOutcome}
              onClick={() => onSelect(stage)}
              style={{ clipPath }}
              className={cn(
                'flex h-9 w-full items-center justify-center gap-1.5 text-xs font-medium transition-colors outline-none disabled:cursor-default',
                index === 0 ? 'rounded-l-md pl-3' : 'pl-6',
                index === segments.length - 1 ? 'rounded-r-md pr-3' : 'pr-5',
                isCurrent
                  ? 'bg-(--stage) text-white'
                  : isPast
                    ? 'bg-foreground/10 text-foreground hover:bg-foreground/15'
                    : 'bg-muted text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
              )}
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isOutcome ? (
                stage.isWon ? (
                  <Check className="size-3.5" />
                ) : (
                  <X className="size-3.5" />
                )
              ) : isPast ? (
                <Check className="size-3.5" />
              ) : null}
              <span className="truncate">{stage.name}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
