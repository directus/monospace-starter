import { useCollectionAccess } from '@/lib/permissions'
import { Check, ChevronDown, Loader2, RotateCcw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ReactNode } from 'react'

import { appCopy } from '@/lib/app.copy'
import { StageDot } from '@/modules/crm/components/stage-dot'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { PipelineStage } from '@/modules/crm/data'
import { stageColor } from '@/modules/crm/stage-color'
import type { Uuid } from '@/generated/monospace'

// One primary action for a deal (Mark won, or Reopen once closed) with the rest behind a chevron.
export function DealActions({
  stages,
  currentStageId,
  pendingStageId,
  onSelect,
  onDelete,
  children,
}: {
  stages: Array<PipelineStage>
  currentStageId: Uuid | null | undefined
  pendingStageId?: Uuid
  onSelect: (stage: PipelineStage) => void
  // Leave out to hide Delete (the user can't delete deals).
  onDelete?: () => void
  // Extra menu items, placed before Delete.
  children?: ReactNode
}) {
  const access = useCollectionAccess('opportunities')
  const canMove = access.canUpdate('stageId') && access.canUpdate('status')
  const current = stages.find((stage) => stage.id === currentStageId)
  const won = stages.find((stage) => stage.isWon)
  const lost = stages.find((stage) => stage.isClosed && !stage.isWon)
  const reopenTarget = stages.filter((stage) => !stage.isClosed).at(-1)
  const busy = Boolean(pendingStageId)
  const closed = Boolean(current?.isClosed)
  const primary = closed ? reopenTarget : won
  const primaryLabel = closed ? crmCopy.deals.stepper.reopen : crmCopy.deals.stepper.markWon
  const PrimaryIcon = closed ? RotateCcw : Check

  return (
    <div className="flex items-center">
      {primary ? (
        <Button
          className="rounded-r-none"
          disabled={busy || !canMove}
          onClick={() => onSelect(primary)}
        >
          {pendingStageId === primary.id ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <PrimaryIcon data-icon="inline-start" />
          )}
          {primaryLabel}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon"
              className={
                primary
                  ? '-ml-px rounded-l-none border-l border-l-primary-foreground/20'
                  : undefined
              }
              disabled={busy || !canMove}
            />
          }
        >
          <ChevronDown />
          <span className="sr-only">{appCopy.common.actions}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {!closed && lost ? (
            <DropdownMenuItem disabled={!canMove} onClick={() => onSelect(lost)}>
              <StageDot stage={lost} />
              <span style={{ color: stageColor(lost) }}>{crmCopy.deals.stepper.markLost}</span>
            </DropdownMenuItem>
          ) : null}
          {closed && current && !current.isWon && won ? (
            <DropdownMenuItem disabled={!canMove} onClick={() => onSelect(won)}>
              <StageDot stage={won} />
              <span style={{ color: stageColor(won) }}>{crmCopy.deals.stepper.markWon}</span>
            </DropdownMenuItem>
          ) : null}
          {closed && current?.isWon && lost ? (
            <DropdownMenuItem disabled={!canMove} onClick={() => onSelect(lost)}>
              <StageDot stage={lost} />
              <span style={{ color: stageColor(lost) }}>{crmCopy.deals.stepper.markLost}</span>
            </DropdownMenuItem>
          ) : null}
          {children}
          {onDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 />
                {appCopy.common.delete}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
