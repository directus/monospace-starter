import { Link } from '@tanstack/react-router'
import {
  CalendarX2,
  ChevronDown,
  ClipboardPen,
  Flag,
  MoreHorizontal,
  Pencil,
  ThumbsUp,
  Video,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { RelativeTime } from '@/components/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar, userName } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  candidateName,
  parseScorecardItems,
} from '@/modules/ats/components/interviews/interview-helpers'
import {
  PeopleStack,
  RecommendationBadge,
} from '@/modules/ats/components/interviews/recommendation'
import { ScheduleInterviewDrawer } from '@/modules/ats/components/interviews/schedule-drawer'
import { ScorecardDrawer } from '@/modules/ats/components/interviews/scorecard-drawer'
import type { InterviewRow, ScorecardRow } from '@/modules/ats/data/interviews'
import { useCancelInterview } from '@/modules/ats/mutations/interviews'

const copy = atsCopy.interviews

const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

const monthName = new Intl.DateTimeFormat('en-US', { month: 'short' })

const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

export function timeRange(interview: InterviewRow) {
  if (!interview.startsAt) return ''
  const start = new Date(interview.startsAt)
  const end = interview.endsAt ? new Date(interview.endsAt) : null

  return end ? `${clock.format(start)} – ${clock.format(end)}` : clock.format(start)
}

export function owedBy(interview: InterviewRow) {
  return interview.participants.filter(
    (participant) =>
      !interview.scorecards.some((card) => card.interviewerUserId === participant.userId),
  )
}

type Phase = 'upcoming' | 'awaiting' | 'done' | 'cancelled'

function phaseOf(interview: InterviewRow, now: number): Phase {
  if (interview.status === 'cancelled') return 'cancelled'

  if (new Date(interview.startsAt ?? 0).getTime() > now) return 'upcoming'

  return owedBy(interview).length ? 'awaiting' : 'done'
}

function PhaseBadge({ phase }: { phase: Phase }) {
  if (phase === 'cancelled') {
    return <Badge variant="destructive">{atsCopy.options.interviewStatus.cancelled}</Badge>
  }

  if (phase === 'awaiting') {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
        {copy.awaitingFeedback}
      </Badge>
    )
  }

  if (phase === 'done') {
    return <Badge variant="success">{atsCopy.options.interviewStatus.completed}</Badge>
  }

  return <Badge variant="secondary">{atsCopy.options.interviewStatus.scheduled}</Badge>
}

type ScorecardTarget = { interview: InterviewRow; userId: Uuid | null }

// Interview cards plus everything they open: edit, cancel, and scorecard drawers.
export function InterviewList({
  interviews,
  showCandidate = false,
  showScorecards = true,
}: {
  interviews: Array<InterviewRow>
  showCandidate?: boolean
  showScorecards?: boolean
}) {
  const [now] = useState(() => Date.now())
  const [editing, setEditing] = useState<InterviewRow>()
  const [cancelling, setCancelling] = useState<InterviewRow>()
  const [scoring, setScoring] = useState<ScorecardTarget>()
  const cancel = useCancelInterview()

  const candidateId = editing?.applications?.candidateId

  return (
    <>
      <ul className="space-y-3">
        {interviews.map((interview) => (
          <li key={interview.id}>
            <InterviewCard
              interview={interview}
              phase={phaseOf(interview, now)}
              showCandidate={showCandidate}
              showScorecards={showScorecards}
              onEdit={() => setEditing(interview)}
              onCancel={() => {
                cancel.reset()
                setCancelling(interview)
              }}
              onScorecard={(userId) => setScoring({ interview, userId })}
            />
          </li>
        ))}
      </ul>

      {candidateId ? (
        <ScheduleInterviewDrawer
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(undefined)}
          candidateId={candidateId}
          interview={editing}
        />
      ) : null}

      {scoring ? (
        <ScorecardDrawer
          open={Boolean(scoring)}
          onOpenChange={(open) => !open && setScoring(undefined)}
          interview={scoring.interview}
          interviewerUserId={scoring.userId}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(open) => !open && setCancelling(undefined)}
        title={copy.cancel.title}
        description={copy.cancel.description(cancelling?.title ?? '')}
        confirmLabel={copy.cancel.confirm}
        pendingLabel={copy.cancel.pending}
        pending={cancel.isPending}
        error={cancel.error ? errorMessage(cancel.error) : undefined}
        onConfirm={() => {
          const candidate = cancelling?.applications?.candidates

          if (!cancelling || !candidate?.id) return

          cancel.mutate(
            {
              id: cancelling.id,
              message: {
                candidateId: candidate.id,
                subject: copy.messages.cancelledSubject(cancelling.title ?? ''),
                body: copy.messages.cancelledBody(
                  candidate.firstName ?? '',
                  cancelling.title ?? '',
                  formatDateTime(cancelling.startsAt),
                ),
              },
            },
            { onSuccess: () => setCancelling(undefined) },
          )
        }}
      />
    </>
  )
}

function InterviewCard({
  interview,
  phase,
  showCandidate,
  showScorecards,
  onEdit,
  onCancel,
  onScorecard,
}: {
  interview: InterviewRow
  phase: Phase
  showCandidate: boolean
  showScorecards: boolean
  onEdit: () => void
  onCancel: () => void
  onScorecard: (userId: Uuid | null) => void
}) {
  const start = new Date(interview.startsAt ?? 0)
  const owed = owedBy(interview)
  const candidate = interview.applications?.candidates
  const job = interview.applications?.requisitions
  const cancelled = phase === 'cancelled'
  const [open, setOpen] = useState(phase === 'awaiting' || phase === 'done')

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-xs',
        cancelled && 'bg-muted/30',
      )}
    >
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        <time
          dateTime={interview.startsAt ?? undefined}
          className={cn(
            'flex w-12 shrink-0 flex-col items-center justify-center self-start rounded-lg border bg-background py-1.5 leading-none',
            phase === 'upcoming' && 'border-primary/30 bg-primary/5',
          )}
        >
          <span className="text-[10px] font-medium text-muted-foreground uppercase">
            {dayName.format(start)}
          </span>
          <span className="my-0.5 text-lg font-semibold tabular-nums">{start.getDate()}</span>
          <span className="text-[10px] text-muted-foreground uppercase">
            {monthName.format(start)}
          </span>
        </time>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3
              className={cn(
                'truncate font-medium',
                cancelled && 'text-muted-foreground line-through',
              )}
            >
              {showCandidate && candidate?.id ? (
                <Link
                  to="/ats/candidates/$candidateId"
                  params={{ candidateId: candidate.id }}
                  className="hover:underline"
                >
                  {candidateName(candidate)}
                </Link>
              ) : (
                interview.title
              )}
            </h3>
            <PhaseBadge phase={phase} />
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span className="tabular-nums">{timeRange(interview)}</span>
            {showCandidate ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{interview.title}</span>
              </>
            ) : interview.interview_stages?.name &&
              interview.interview_stages.name !== interview.title ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{interview.interview_stages.name}</span>
              </>
            ) : null}
            {job?.title ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{job.title}</span>
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
            <PeopleStack people={interview.participants.map((participant) => participant.user)} />
            {interview.participants.length && phase !== 'upcoming' && !cancelled ? (
              <span className="text-xs text-muted-foreground">
                {copy.scorecardCount(
                  interview.participants.length - owed.length,
                  interview.participants.length,
                )}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-1">
          {phase === 'upcoming' && interview.meetingUrl ? (
            <a
              href={interview.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className: 'max-sm:hidden',
              })}
            >
              <Video data-icon="inline-start" />
              {copy.joinMeet}
            </a>
          ) : null}
          {phase === 'awaiting' ? (
            <Button
              size="sm"
              variant="outline"
              className="max-sm:hidden"
              onClick={() => onScorecard(null)}
            >
              <ClipboardPen data-icon="inline-start" />
              {copy.actions.addScorecard}
            </Button>
          ) : null}
          {cancelled ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                <MoreHorizontal />
                <span className="sr-only">{copy.actions.more}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {interview.meetingUrl && !cancelled ? (
                  <DropdownMenuItem
                    render={<a href={interview.meetingUrl} target="_blank" rel="noreferrer" />}
                  >
                    <Video />
                    {copy.joinMeet}
                  </DropdownMenuItem>
                ) : null}
                {!cancelled && phase !== 'upcoming' ? (
                  <DropdownMenuItem onClick={() => onScorecard(null)}>
                    <ClipboardPen />
                    {copy.actions.addScorecard}
                  </DropdownMenuItem>
                ) : null}
                {phase === 'upcoming' ? (
                  <>
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil />
                      {copy.actions.edit}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={onCancel}>
                      <CalendarX2 />
                      {copy.actions.cancel}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {showScorecards && !cancelled && phase !== 'upcoming' && interview.participants.length ? (
        <div className="border-t bg-muted/20">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
            {copy.scorecard.plural}
            <span className="flex flex-wrap gap-1">
              {interview.scorecards.map((card) => (
                <RecommendationBadge
                  key={card.id}
                  value={card.recommendation}
                  className="h-4 px-1.5 text-[10px]"
                />
              ))}
            </span>
          </button>
          {open ? (
            <div className="space-y-3 px-4 pb-4">
              {interview.scorecards.map((card) => (
                <ScorecardView
                  key={card.id}
                  scorecard={card}
                  onEdit={() => onScorecard(card.interviewerUserId ?? null)}
                />
              ))}
              {owed.length ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
                  <span className="text-muted-foreground">
                    {copy.owes(owed.map((participant) => userName(participant.user)).join(', '))}
                  </span>
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    {owed.map((participant) => (
                      <Button
                        key={participant.userId}
                        size="xs"
                        variant="outline"
                        onClick={() => onScorecard(participant.userId)}
                      >
                        <UserAvatar user={participant.user} size="sm" className="size-4" />
                        {userName(participant.user).split(' ')[0]}
                      </Button>
                    ))}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function ScorecardView({ scorecard, onEdit }: { scorecard: ScorecardRow; onEdit: () => void }) {
  const positives = parseScorecardItems(scorecard.positives)
  const flags = parseScorecardItems(scorecard.flags)

  const edited =
    scorecard.updatedAt &&
    scorecard.submittedAt &&
    new Date(scorecard.updatedAt).getTime() - new Date(scorecard.submittedAt).getTime() > 60_000

  return (
    <section className="space-y-2.5 rounded-lg border bg-card p-3">
      <header className="flex flex-wrap items-center gap-2">
        <UserAvatar user={scorecard.interviewer} size="sm" />
        <span className="text-sm font-medium">{userName(scorecard.interviewer)}</span>
        <RecommendationBadge value={scorecard.recommendation} />
        <span className="text-xs text-muted-foreground">
          <RelativeTime value={scorecard.submittedAt} />
          {edited ? (
            <>
              {' · '}
              {copy.scorecard.edited} <RelativeTime value={scorecard.updatedAt} />
            </>
          ) : null}
        </span>
        <Button variant="ghost" size="xs" className="ml-auto" onClick={onEdit}>
          <Pencil data-icon="inline-start" />
          {copy.actions.editScorecard}
        </Button>
      </header>
      {scorecard.summary ? (
        <p className="text-sm whitespace-pre-line">{scorecard.summary}</p>
      ) : null}
      {positives.length || flags.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ItemList
            title={copy.scorecard.positives}
            items={positives}
            icon={<ThumbsUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
          />
          <ItemList
            title={copy.scorecard.flags}
            items={flags}
            icon={<Flag className="size-3.5 text-rose-600 dark:text-rose-400" />}
          />
        </div>
      ) : null}
    </section>
  )
}

function ItemList({
  title,
  items,
  icon,
}: {
  title: string
  items: ReturnType<typeof parseScorecardItems>
  icon: ReactNode
}) {
  if (!items.length) return null

  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2 text-sm">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span className="min-w-0">
              <span className="block">{item.point}</span>
              {item.evidence ? (
                <span className="block text-xs text-muted-foreground">
                  {copy.scorecard.evidence}: {item.evidence}
                </span>
              ) : null}
              {item.mitigation ? (
                <span className="block text-xs text-muted-foreground">
                  {copy.scorecard.mitigation}: {item.mitigation}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
