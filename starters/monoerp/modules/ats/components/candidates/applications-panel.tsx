import { Link } from '@tanstack/react-router'
import { Briefcase, CircleSlash, ExternalLink, RotateCcw, TimerReset, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { RecordMenu } from '@/components/record-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Frame, FramePanel } from '@/components/ui/frame'
import type { Uuid } from '@/generated/monospace'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { StageProgress } from '@/modules/ats/components/candidates/stage-progress'
import { JobStatusBadge } from '@/modules/ats/components/jobs/job-badges'
import { RejectDialog } from '@/modules/ats/components/jobs/reject-dialog'
import type { CandidateApplication, InterviewStage } from '@/modules/ats/data/candidates'
import { useUpdateApplication } from '@/modules/ats/mutations/candidates'

const copy = atsCopy.candidates.applications

const DAY = 86_400_000

const STATUS_TONE = {
  active: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  rejected: 'bg-destructive/10 text-destructive',
  withdrawn: 'bg-muted text-muted-foreground',
  hired: 'bg-success/10 text-success',
}

export function ApplicationStatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? 'active'

  return (
    <Badge variant="secondary" className={toneFor(STATUS_TONE, value)}>
      {optionLabel('applicationStatus', value)}
    </Badge>
  )
}

function toneFor(tones: Record<string, string>, value: string) {
  return tones[value]
}

export function daysSince(iso: string | null | undefined, now: number) {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : 0
}

export function ApplicationsPanel({
  candidateName,
  applications,
  onAddToJob,
  renderExtra,
}: {
  candidateName: string
  applications: Array<CandidateApplication>
  onAddToJob?: () => void
  // Slot under each application, for the offer panel.
  renderExtra?: (application: CandidateApplication) => ReactNode
}) {
  if (!applications.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
        <Briefcase className="size-6 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">{copy.empty}</p>
          <p className="text-sm text-muted-foreground">{copy.emptyHint}</p>
        </div>
        {onAddToJob ? (
          <Button variant="outline" size="sm" onClick={onAddToJob}>
            {copy.addTitle}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {applications.map((application) => (
        <ApplicationCard
          key={application.id}
          candidateName={candidateName}
          application={application}
          extra={renderExtra?.(application)}
        />
      ))}
    </div>
  )
}

function ApplicationCard({
  candidateName,
  application,
  extra,
}: {
  candidateName: string
  application: CandidateApplication
  extra?: ReactNode
}) {
  const update = useUpdateApplication({ notify: false })
  const [pendingStageId, setPendingStageId] = useState<Uuid>()
  const [rejecting, setRejecting] = useState(false)
  const [now] = useState(() => Date.now())
  const job = application.requisitions
  const stages = application.stages
  const current = stages.find((stage) => stage.id === application.interviewStageId)
  const status = application.status ?? 'active'
  const stopped = status === 'rejected' || status === 'withdrawn'
  const days = daysSince(application.stageEnteredAt, now)
  const overSla = status === 'active' && current?.slaDays != null && days > current.slaDays

  function move(stage: InterviewStage) {
    setPendingStageId(stage.id)
    update.mutate(
      {
        id: application.id,
        data: { interviewStageId: stage.id, status: statusFor(stage) },
      },
      {
        onSuccess: () => toast.success(copy.moved(stage.name ?? '')),
        onError: () => toast.error(copy.moveFailed),
        onSettled: () => setPendingStageId(undefined),
      },
    )
  }

  function setStatus(next: 'active' | 'withdrawn', message: string) {
    update.mutate(
      { id: application.id, data: { status: next, rejectionReason: null } },
      { onSuccess: () => toast.success(message) },
    )
  }

  return (
    <Frame dense>
      <FramePanel className="space-y-4 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {job?.id ? (
                <Link
                  to="/ats/jobs/$jobId"
                  params={{ jobId: job.id }}
                  className="truncate font-semibold hover:underline"
                >
                  {job.title}
                </Link>
              ) : (
                <span className="font-semibold">{job?.title}</span>
              )}
              <ApplicationStatusBadge status={status} />
              {job?.status && job.status !== 'open' ? <JobStatusBadge status={job.status} /> : null}
            </div>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              {job?.reqNumber ? <span className="font-mono">REQ-{job.reqNumber}</span> : null}
              {job?.departments?.name ? <span>· {job.departments.name}</span> : null}
              <span>· {copy.applied(formatDate(application.appliedAt))}</span>
            </p>
          </div>
          <RecordMenu size="icon-sm" variant="ghost">
            {job?.id ? (
              <DropdownMenuItem render={<Link to="/ats/jobs/$jobId" params={{ jobId: job.id }} />}>
                <ExternalLink />
                {copy.openJob}
              </DropdownMenuItem>
            ) : null}
            {status === 'active' ? (
              <>
                <DropdownMenuItem onClick={() => setStatus('withdrawn', copy.withdrawn)}>
                  <CircleSlash />
                  {copy.withdraw}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setRejecting(true)}>
                  <XCircle />
                  {copy.reject}
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={() => setStatus('active', copy.reopened)}>
                <RotateCcw />
                {copy.reopen}
              </DropdownMenuItem>
            )}
          </RecordMenu>
        </div>

        {stages.length ? (
          <StageProgress
            stages={stages}
            currentStageId={application.interviewStageId}
            pendingStageId={pendingStageId}
            stopped={stopped}
            onSelect={move}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{copy.noStages}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {status === 'active' ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5',
                overSla
                  ? 'font-medium text-amber-700 dark:text-amber-400'
                  : 'text-muted-foreground',
              )}
            >
              <TimerReset className="size-3.5" />
              {copy.daysInStage(days)}
              {overSla && current?.slaDays != null ? (
                <span className="font-normal">· {copy.overSla(current.slaDays)}</span>
              ) : null}
            </span>
          ) : null}
          {status === 'rejected' && application.rejectionReason ? (
            <span className="text-muted-foreground">
              {copy.rejectedBecause(application.rejectionReason)}
            </span>
          ) : null}
          {status === 'active' ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive max-sm:hidden"
              onClick={() => setRejecting(true)}
            >
              <XCircle data-icon="inline-start" />
              {copy.reject}
            </Button>
          ) : null}
        </div>
        {extra}
      </FramePanel>

      <RejectDialog
        name={candidateName}
        open={rejecting}
        onOpenChange={setRejecting}
        onReject={async (reason) => {
          await update.mutateAsync({
            id: application.id,
            data: { status: 'rejected', rejectionReason: reason },
          })
          toast.success(copy.rejected)
        }}
      />
    </Frame>
  )
}

// Landing on the Hired stage hires them; leaving it puts them back in process.
function statusFor(stage: InterviewStage) {
  return stage.kind === 'hired' ? 'hired' : 'active'
}
