import { Check, ChevronDown, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Uuid } from '@/generated/monospace'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import { kindColor } from '@/modules/ats/components/home/stage-kinds'
import type { InterviewStage } from '@/modules/ats/data/candidates'

const copy = atsCopy.candidates.applications

// A job's interview plan as a segmented track: one segment per stage, filled up to the current
// one in each stage's kind color. Plans run to ten stages or more, so names live in the label
// and the Move menu rather than on the track, where they'd truncate.
export function StageProgress({
  stages,
  currentStageId,
  pendingStageId,
  stopped = false,
  onSelect,
  className,
}: {
  stages: Array<InterviewStage>
  currentStageId: Uuid | null | undefined
  pendingStageId?: Uuid
  // Rejected or withdrawn: the track shows where they stopped.
  stopped?: boolean
  // Leave out for a read-only track (no Move menu).
  onSelect?: (stage: InterviewStage) => void
  className?: string
}) {
  const index = stages.findIndex((stage) => stage.id === currentStageId)
  const current = stages[index]

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex min-h-7 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: stopped ? 'var(--destructive)' : kindColor(current?.kind) }}
          />
          <span className="truncate font-medium">{current?.name ?? copy.noStage}</span>
          {index >= 0 ? (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {copy.stageOf(index + 1, stages.length)}
            </span>
          ) : null}
        </div>
        {onSelect ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={stopped || Boolean(pendingStageId)}
                  className="shrink-0"
                />
              }
            >
              {pendingStageId ? <Loader2 className="animate-spin" /> : null}
              {copy.move}
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{copy.plan}</DropdownMenuLabel>
                {stages.map((stage, position) => {
                  const isCurrent = stage.id === currentStageId

                  return (
                    <DropdownMenuItem
                      key={stage.id}
                      disabled={isCurrent}
                      onClick={() => onSelect(stage)}
                      className="gap-2.5"
                    >
                      <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">
                        {position + 1}
                      </span>
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: kindColor(stage.kind) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{stage.name}</span>
                      {isCurrent ? <Check className="text-muted-foreground" /> : null}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <ol aria-label={copy.stepper} className="flex gap-1">
        {stages.map((stage, position) => {
          const reached = index >= 0 && position <= index
          const isCurrent = position === index

          return (
            <li key={stage.id} className="min-w-0 flex-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      aria-current={isCurrent ? 'step' : undefined}
                      className={cn(
                        'block h-1.5 rounded-full bg-muted transition-colors',
                        reached && !isCurrent && 'opacity-70',
                      )}
                      style={
                        reached
                          ? {
                              background:
                                stopped && isCurrent ? 'var(--destructive)' : kindColor(stage.kind),
                            }
                          : undefined
                      }
                    />
                  }
                />
                <TooltipContent>
                  {copy.stageOf(position + 1, stages.length)} · {stage.name}
                </TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
