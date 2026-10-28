import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Uuid } from '@/generated/monospace'
import { atsCopy } from '@/modules/ats/ats.copy'
import { stageNeighborsQuery } from '@/modules/ats/data/candidates'
import type { CandidateApplication } from '@/modules/ats/data/candidates'

const copy = atsCopy.candidates.pipelineNav

// Shown when the profile was opened from a job's pipeline (`?job=`): a way back to that board,
// and arrows through the other candidates in the same column.
export function PipelineNav({
  candidateId,
  jobId,
  application,
}: {
  candidateId: Uuid
  jobId: Uuid
  // The candidate's application on that job; missing if they've since left it.
  application: CandidateApplication | undefined
}) {
  const stageId = application?.status === 'active' ? application.interviewStageId : null
  const stage = application?.stages.find((row) => row.id === stageId)

  const neighbors = useQuery({
    ...stageNeighborsQuery(jobId, stageId ?? jobId),
    enabled: Boolean(stageId),
  })

  const ids = neighbors.data ?? []
  const index = ids.indexOf(candidateId)
  const previous = index > 0 ? ids[index - 1] : undefined
  const next = index >= 0 ? ids[index + 1] : undefined

  return (
    <nav className="-mt-1 flex min-h-8 items-center gap-3">
      <Link
        to="/ats/jobs/$jobId"
        params={{ jobId }}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4 shrink-0" />
        <span className="truncate">{copy.back(application?.requisitions?.title ?? '')}</span>
      </Link>
      {index >= 0 && stage ? (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground tabular-nums max-sm:hidden">
            {copy.position(index + 1, ids.length, stage.name ?? '')}
          </span>
          <StepLink
            candidateId={previous}
            jobId={jobId}
            label={copy.previous}
            direction="previous"
          />
          <StepLink candidateId={next} jobId={jobId} label={copy.next} direction="next" />
        </div>
      ) : null}
    </nav>
  )
}

function StepLink({
  candidateId,
  jobId,
  label,
  direction,
}: {
  candidateId: Uuid | undefined
  jobId: Uuid
  label: string
  direction: 'previous' | 'next'
}) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight

  if (!candidateId) {
    return (
      <Button variant="outline" size="icon-sm" disabled aria-label={label}>
        <Icon />
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={label}
            nativeButton={false}
            render={
              <Link
                to="/ats/candidates/$candidateId"
                params={{ candidateId }}
                search={{ job: jobId }}
              />
            }
          />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
